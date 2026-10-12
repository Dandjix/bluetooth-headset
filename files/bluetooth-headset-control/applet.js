const Applet = imports.ui.applet;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GUdev = imports.gi.GUdev;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
//my imports
const UUID = `bluetooth-headset-control`
const AppletImportDir = imports.ui.appletManager.applets[UUID];
const config = AppletImportDir.config.config
const commands = AppletImportDir.commands

//file paths
const AppletDirPath = `${GLib.get_home_dir()}/.local/share/cinnamon/applets/bluetooth-headset-control`

const Icon_loading = `${AppletDirPath}/icons/content-loading-symbolic.svg`
const Icon_headphones = `${AppletDirPath}/icons/headphones.svg`
const Icon_speaker = `${AppletDirPath}/icons/speaker.svg`
const Icon_bluetooth_loading = `${AppletDirPath}/icons/bluetooth-loading.svg`

class BHsT_stateMachineState {
    enter(stateMachine) { }
    leave(stateMachine) { }
    cleanup(stateMachine) { }
    clickedIcon(stateMachine) { }
    middleClickedIcon(stateMachine) { }
    async update(stateMachine) {}
}


class BHsT_stateSpeakers extends BHsT_stateMachineState {
    enter(stateMachine) {
        stateMachine.update_appearance(Icon_speaker, "Click to pair and use headset");
    }
    clickedIcon(stateMachine) {
        stateMachine.change("pairing")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BHsT_stateHeadset extends BHsT_stateMachineState {
    enter(stateMachine) {
        stateMachine.update_appearance(
            Icon_headphones, 
            "Click to disconnect and use speakers"
        )
    }
    async update(stateMachine)
    {
        const battery = await commands.get_battery(stateMachine.current_headphone_device);
        if(stateMachine.mode_current == this)
        {
            this._set_battery_level(stateMachine,battery)
            global.log(`set battery level to : ${battery}`)
        }
    }
    leave(stateMachine){

    }
    cleanup(stateMachine){

    }
    clickedIcon(stateMachine) {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine) {
    }

    _set_battery_level(stateMachine,battery_level)
    {
        if(battery_level !== null && battery_level !== undefined)
        {
            stateMachine.update_appearance(
                Icon_headphones, 
                "Click to disconnect and use speakers",
                `${battery_level}%`,
                this._labelColor(battery_level)
            )
        }
        else
        {
            stateMachine.update_appearance(
                Icon_headphones, 
                "Click to disconnect and use speakers",
            )
        }
    }
    _labelColor(battery_level)
    {
        if(battery_level >= 95)
        {
            return "#00ff00"
        }
        else if(battery_level >= 40)
        {
            return "#ffffff"
        }
        else if(battery_level >= 20)
        {
            return "#ffff00"
        }
        else
        {
            return "#ff0000"
        }
    }

}

class BHsT_statePairing extends BHsT_stateMachineState {
    async pair(stateMachine) {
        const device = await commands.find_headset(config.headset_name)
        if (!device) {
            return "speaker"
        }
        const success = await commands.connect_headset(device)
        if (!success) {
            return "speaker"
        }
        return "headphone"
    }

    async update(stateMachine)
    {
        const device = await this.pair(stateMachine)

        global.log(`device gotten from pairing pair : ${device}`)

        stateMachine.change(device)
    }

    enter(stateMachine) {
        stateMachine.update_appearance(Icon_bluetooth_loading, "Click cancel and use speakers")

    }
    clickedIcon(stateMachine) {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BluetoothHeadsetControl extends Applet.TextIconApplet {

    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.update_appearance(Icon_loading, "Loading Bluetooth Headset Control ...");

        this.mode_speaker = new BHsT_stateSpeakers()
        this.mode_pairing = new BHsT_statePairing()
        this.mode_headphones = new BHsT_stateHeadset()

        this.mode_current = this.mode_pairing

        this.current_headphone_device = ""
        
        this.mode_current.enter(this)

        this._update_loop_id = undefined
        this._update_loop()
    }

    update_appearance(icon, tooltip, label = "", color="#ffffff") {
        this.set_applet_icon_path(icon);
        this._applet_icon.set_icon_size(20);
        this.set_applet_tooltip(tooltip);
        this.set_applet_label(label)

        this._applet_label.set_style(`color: ${color};`);
    }
    _update_loop()
    {
        try{
            this.mode_current.update(this).catch(e => {

                const error = `[BTHS] mode update failed: ${e}`

                global.logError(error);
                Main.notify(error);
            });
            
            this._update_loop_id = Mainloop.timeout_add(config.timer.repeat, Lang.bind(this,() => this._update_loop(this)));
            global.log(`update loop done, next id : ${this._update_loop_id}`)
        }
        catch(e)
        {
            const error = `[BTHS] applet update loop error : ${e}`

            global.logError(error);
            Main.notify(error);
        }
    }

    
    change(mode_name) {
        if (mode_name == "headphone") {
            this.mode_current.leave(this)
            this.mode_current = this.mode_headphones
            this.mode_current.enter(this)
        }
        else if (mode_name == "speaker") {
            this.mode_current.leave(this)
            this.mode_current = this.mode_speaker
            this.mode_current.enter(this)
        }
        else if (mode_name == "pairing") {
            this.mode_current.leave(this)
            this.mode_current = this.mode_pairing
            this.mode_current.enter(this)
        }
        else {
            throw `Cannot change to mode : ${mode_name}`
        }
        //we execute the loop, but not using _update_loop since that would cause it to repeat in a loop, which is weird and a memory leak also
        this.mode_current.update(this).catch(e => {
            const error = `[BTHS] mode update failed (transition call): ${e}`
            global.logError(error);
            Main.notify(error)
        });
    }

    on_applet_clicked() {
        this.mode_current.clickedIcon(this)
    }

    on_applet_middle_clicked() {
        this.mode_current.middleClickedIcon(this)
    }

    on_applet_removed_from_panel() {
        try{
            global.log("removing applet ...")
            //cleanup : restore default functionnality
            this.mode_current.cleanup(this)

            if(this._update_loop_id)
            {
                Mainloop.source_remove(this._update_loop_id);
                global.log(`removed loop ${this._update_loop_id} !`)
            }
            global.log("applet removed !")
        }
        catch(e)
        {
            const error = `[BTHS] encountered error while removing applet : ${e}`
            global.logError(error)
            Main.notify(error)
        }
    }
}

function main(metadata, orientation, panelHeight, instanceId) { // Define the main function receiving the standard parameters sent during the instantiation of the applet to the panel

    const applet = new BluetoothHeadsetControl(metadata, orientation, panelHeight, instanceId);

    // var parent = Object.getPrototypeOf(applet)
    // global.log(Object.getOwnPropertyNames(applet))
    // while(parent !==  null)
    // {
    //     global.log(`\n--${parent.constructor.name}--\n`)
    //     global.log(Object.getOwnPropertyNames(parent))
    //     parent = Object.getPrototypeOf(parent)
    // }
    // global.log(JSON.stringify(applet.finalizeContextMenu))

    return applet
}
