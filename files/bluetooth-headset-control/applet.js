const Applet = imports.ui.applet;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GUdev = imports.gi.GUdev;

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');


const AppletDir = `${GLib.get_home_dir()}/.local/share/cinnamon/applets/bluetooth-headset-control`

const Icon_loading = `${AppletDir}/icons/content-loading-symbolic.svg`
const Icon_headphones = `${AppletDir}/icons/headphones.svg`
const Icon_speaker = `${AppletDir}/icons/speaker.svg`
const Icon_bluetooth_loading = `${AppletDir}/icons/bluetooth-loading.svg`

class BHsT_stateMachineState
{
    enter(stateMachine){}
    leave(stateMachine){}
    clickedIcon(stateMachine){}
    middleClickedIcon(stateMachine){}
}


class BHsT_stateSpeakers extends BHsT_stateMachineState
{
    enter(stateMachine)
    {
        stateMachine.update_appearance(Icon_speaker,"Click to pair and use headset")
    }
    clickedIcon(stateMachine)
    {
        stateMachine.change("pairing")
    }
    middleClickedIcon(stateMachine)
    {

    }
}

class BHsT_stateHeadset extends BHsT_stateMachineState
{
    enter(stateMachine)
    {
        stateMachine.update_appearance(Icon_headphones,"Click to disconnect and use speakers")

    }
    clickedIcon(stateMachine)
    {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine)
    {

    }
}

class BHsT_statePairing extends BHsT_stateMachineState
{
    enter(stateMachine)
    {
        stateMachine.update_appearance(Icon_bluetooth_loading,"Click cancel and use speakers")
        stateMachine.use_bluetooth((res) => global.log(`result gotten from use bluetooth : ${res}`));
    }
    clickedIcon(stateMachine)
    {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine)
    {

    }
}

class BluetoothHeadsetControl extends Applet.IconApplet{
    constructor(metadata, orientation, panelHeight, instanceId){
        super(orientation, panelHeight, instanceId);
        this.update_appearance(Icon_loading,"Loading Bluetooth Headset Control ...");

        this.mode_speaker = new BHsT_stateSpeakers()
        this.mode_pairing = new BHsT_statePairing()
        this.mode_headphones = new BHsT_stateHeadset()

        this.mode_current = this.mode_pairing
        this.mode_current.enter(this)
    }

    update_appearance(icon,tooltip)
    {
        this.set_applet_icon_path(icon);
        this._applet_icon.set_icon_size(20);
        this.set_applet_tooltip(tooltip);
    }

    change(mode_name)
    {
        if(mode_name == "headphones")
        {
            this.mode_current.leave(this)
            this.mode_current = this.mode_headphones
            this.mode_current.enter(this)
        }
        else if(mode_name == "speaker")
        {
            this.mode_current.leave(this)
            this.mode_current = this.mode_speaker
            this.mode_current.enter(this)
        }
        else if(mode_name == "pairing")
        {
            this.mode_current.leave(this)
            this.mode_current = this.mode_pairing
            this.mode_current.enter(this)
        }
        else
        {
            throw `Cannot change to mode : ${mode_name}`
        }
    }

    on_applet_clicked(){
        this.mode_current.clickedIcon(this)
    }

    on_applet_middle_clicked(){
        this.mode_current.middleClickedIcon(this)
    }

    on_applet_removed_from_panel() {
        //cleanup : restore default functionnality

    }
    
    // -- pairing logic

    async use_bluetooth(callback){
        try{
            global.log("init")
            const proc = Gio.Subprocess.new(['bluetoothctl', 'list'],Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);

            const stdout = (await proc.communicate_utf8_async(null, null))[0];

            let lines = stdout.split("\n");

            lines = lines.filter((l) => l);
            
            if(lines.length != 1)
            {
                callback("back-to-speaker")
            }

            const controller = lines[0];
                
            global.log(`stdout : ${stdout}`)
        }
        catch(e)
        {
            global.logError(`bad-bad horrible thing-thing happened : ${e}`)
            callback("back-to-speaker")

        }

    }


    // -- speaker use logic

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
