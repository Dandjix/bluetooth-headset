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
    /**
     * called when entering the state, after the previous state has left.
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    async enter(stateMachine) { }
    /**
     * called when leaving the state, before the next state has entered
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    async leave(stateMachine) { }
    /**
     * called when the applet is removed from the pannel
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    cleanup(stateMachine) { }
    /**
     * called when the applet icon is clicked
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    clickedIcon(stateMachine) { }
    /**
     * called when the applet icon is middle clicked
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    middleClickedIcon(stateMachine) { }
    /**
     * called at a regular interval.
     * @param {BluetoothHeadsetControl} stateMachine - the state machine, which is also the cinnamon widget
     */
    async update(stateMachine) {}
}


class BHsT_stateSpeakers extends BHsT_stateMachineState {
    async enter(stateMachine) {
        stateMachine.update_appearance(Icon_speaker, "Click to pair and use headset");
    }
    clickedIcon(stateMachine) {
        stateMachine.change("pairing")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BHsT_stateHeadset extends BHsT_stateMachineState {
    async enter(stateMachine) {
        stateMachine.update_appearance(
            Icon_headphones, 
            "Click to disconnect and use speakers"
        )
    }
    async update(stateMachine)
    {
        const {
            success: is_connected_success,
            result: is_connected_result,
            error: is_connected_error
        } = await commands.is_connected(stateMachine.current_headphone_device);

        if(!is_connected_success)
        {
            const error = `[BTHS] connection check error : ${is_connected_error}`
            global.log(error)
            Main.notify(error)

            stateMachine.change("speaker")
            return;
        }
        if(is_connected_result == false)
        {
            stateMachine.change("speaker")
            return;
        }



        const battery = await commands.get_battery(stateMachine.current_headphone_device);
        if(stateMachine.mode_current == this)
        {
            this._set_battery_level(stateMachine,battery)
        }
    }
    async leave(stateMachine){
        commands.disconnect(stateMachine.current_headphone_device).then((ret) => {
            const {success, error: disconnect_error} = ret
            if( ! success)
            {
                const error = `[BTHS] disconnect error : ${disconnect_error}`
                global.log(error)
                global.logError(disconnect_error)
    
                Main.notify(disconnect_error)
            }

            stateMachine.current_headphone_device = ""
        })
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

    has_paired_sucessfully = false

    checks_done = 0

    async pair(stateMachine) {
        const device = await commands.find_headset(config.headset_name)
        if (!device) {
            return {success : false, error:`headset : [${config.headset_name}] could not be found.`}
        }
        const {success, error} = await commands.connect_headset(device)
        if (!success) {
            return {success,error}
        }
        
        stateMachine.current_headphone_device = device
        return {success : true, error:""}
    }

    async update(stateMachine)
    {
        if(!this.has_paired_sucessfully) //if we have not yet paired successfully, we do. if it fails, we leave.
        {
            const {success, error: pair_error} = await this.pair(stateMachine)

            if(! success)
            {
                const error = `[BTHS] pairing error : ${pair_error}`
                global.logError(error)
                Main.notify(error)
                stateMachine.change("speaker")
            }
            else
            {
                this.has_paired_sucessfully = true
            }
            return
        }
        //if we have paired, we wait until the device is detected or we reach `post_connection_number_of_tries` tries
        if(this.checks_done > config.pairing.post_connection_number_of_tries)
        {
            stateMachine.change("speaker")
            return
        }
        const {success, result, error} = await commands.is_connected(stateMachine.current_headphone_device)
        if(! success)
        {
            throw new Error(`pairing connection check error : ${error}`)
        }
        if(result)
        {
            stateMachine.change("headphone")
            return
        }
        this.checks_done++
    }

    async enter(stateMachine) {
        this.has_paired_sucessfully = false
        this.checks_done = 0
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
        }
        catch(e)
        {
            const error = `[BTHS] applet update loop error : ${e}`

            global.logError(error);
            Main.notify(error);
        }
    }

    /**
     * changes the state machine mode, updating the ui and switching the update method and such.
     * 
     * @param {'headphone' | 'speaker' | 'pairing'} mode_name - the name of the mode to switch to
     */
    change(mode_name) {
        let new_mode
        if (mode_name == "headphone") {
            new_mode = this.mode_headphones
        }
        else if (mode_name == "speaker") {
            new_mode = this.mode_speaker
        }
        else if (mode_name == "pairing") {
            new_mode = this.mode_pairing
        }
        else {
            throw `Cannot change to mode : ${mode_name}`
        }

        this.mode_current.leave(this)
        this.mode_current = new_mode
        this.mode_current.enter(this).then(()=>{
            //we execute the loop, but not using _update_loop since that would cause it to repeat in a loop, which is weird and a memory leak also
            this.mode_current.update(this).catch(e => {
                const error = `[BTHS] mode update failed (transition call): ${e}`
                global.logError(error);
                Main.notify(error)
            });
        })


    }

    on_applet_clicked() {
        this.mode_current.clickedIcon(this)
    }

    on_applet_middle_clicked() {
        this.mode_current.middleClickedIcon(this)
    }

    on_applet_removed_from_panel() {
        try{
            //cleanup : restore default functionnality
            this.mode_current.cleanup(this)

            if(this._update_loop_id)
            {
                Mainloop.source_remove(this._update_loop_id);
            }
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

    return applet
}
