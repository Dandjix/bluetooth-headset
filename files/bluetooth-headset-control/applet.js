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

class BHsT_stateMachineState {
    enter(stateMachine) { }
    leave(stateMachine) { }
    clickedIcon(stateMachine) { }
    middleClickedIcon(stateMachine) { }
}


class BHsT_stateSpeakers extends BHsT_stateMachineState {
    enter(stateMachine) {
        stateMachine.update_appearance(Icon_speaker, "Click to pair and use headset");
        stateMachine.disconnect().then(() => {global.log("disco nected")})
    }
    clickedIcon(stateMachine) {
        stateMachine.change("pairing")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BHsT_stateHeadset extends BHsT_stateMachineState {
    enter(stateMachine) {
        stateMachine.update_appearance(Icon_headphones, "Click to disconnect and use speakers")

    }
    clickedIcon(stateMachine) {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BHsT_statePairing extends BHsT_stateMachineState {
    async pair(stateMachine) {
        global.log("finding ...")
        const device = await stateMachine.find_headset("Fairbuds XL")
        global.log(`found : ${device}`)
        if (!device) {
            return "speaker"
        }
        const success = await stateMachine.connect_headset(device)
        global.log(`success : ${success}`)
        if (!success) {
            return "speaker"
        }
        return "headphone"
    }


    enter(stateMachine) {
        stateMachine.update_appearance(Icon_bluetooth_loading, "Click cancel and use speakers")
        global.log("launching pair ...")
        this.pair(stateMachine).then((device) => {
            global.log(`pair done : ${device}`)
            stateMachine.change(device)
        })
    }
    clickedIcon(stateMachine) {
        stateMachine.change("speaker")
    }
    middleClickedIcon(stateMachine) {

    }
}

class BluetoothHeadsetControl extends Applet.IconApplet {

    constructor(metadata, orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.update_appearance(Icon_loading, "Loading Bluetooth Headset Control ...");

        this.mode_speaker = new BHsT_stateSpeakers()
        this.mode_pairing = new BHsT_statePairing()
        this.mode_headphones = new BHsT_stateHeadset()

        this.mode_current = this.mode_pairing

        this.current_headphone_device = ""

        this.mode_current.enter(this)
    }

    update_appearance(icon, tooltip) {
        this.set_applet_icon_path(icon);
        this._applet_icon.set_icon_size(20);
        this.set_applet_tooltip(tooltip);
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
    }

    on_applet_clicked() {
        this.mode_current.clickedIcon(this)
    }

    on_applet_middle_clicked() {
        this.mode_current.middleClickedIcon(this)
    }

    on_applet_removed_from_panel() {
        //cleanup : restore default functionnality

    }

    // -- pairing logic

    async device_unicity() {
        try {
            const proc = Gio.Subprocess.new(['bluetoothctl', 'list'], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);

            const stdout = (await proc.communicate_utf8_async(null, null))[0];

            let lines = stdout.split("\n");

            lines = lines.filter((l) => l);

            if (lines.length != 1) {
                return false
            }

            const controller = lines[0];

            return true
        }
        catch (e) {
            global.logError(`exception while listing devvices : ${e}`)
            return false
        }
    }

    async find_headset(name) {
        try {
            const proc = Gio.Subprocess.new(
                ["bluetoothctl"],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE
            );

            const input = [
                'devices',
            ].join('\n') + '\n';

            const [stdout] = await proc.communicate_utf8_async(input, null);

            const lines = stdout.split("\n")

            const device_lines = lines.filter((l) => l.trim().startsWith("Device") && l.trim().endsWith(name))

            if (device_lines.length != 1) {
                return ""
            }
            const headphone_line = device_lines[0]

            const prefix = "Device "
            const suffix = ` ${name}`
            const id = headphone_line.substring(prefix.length, headphone_line.length - suffix.length)

            return id
        }
        catch (e) {
            global.logError(`bad-bad horrible thing-thing happened : ${e}`)
            return ""
        }
    }

    async connect_headset(headset_device) {
        try {
            const proc = Gio.Subprocess.new(
                ["bluetoothctl"],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE
            );

            const input = [
                `connect ${headset_device}`,
            ].join('\n') + '\n';

            const [stdout] = await proc.communicate_utf8_async(input, null);

            global.log(`result of connecting : ${stdout}`)

            this.current_headphone_device = headset_device

            return true
        }
        catch (e) {
            global.logError(`bad-bad horrible thing-thing happened : ${e}`)
            return false
        }
    }

    async turn_off_bluetooth() {
        try {
            const proc = Gio.Subprocess.new(
                ["bluetoothctl"],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE
            );

            const input = [
                'power off',
            ].join('\n') + '\n';

            const [stdout] = await proc.communicate_utf8_async(input, null);
            return true
        }
        catch (e) {
            global.logError(`bad-bad horrible thing-thing happened : ${e}`)
            return false
        }
    }

    async disconnect(){
        try {
            const proc = Gio.Subprocess.new(
                ["bluetoothctl"],
                Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDERR_SILENCE
            );

            const input = [
                `disconnect ${this.current_headphone_device}`,
            ].join('\n') + '\n';

            const [stdout] = await proc.communicate_utf8_async(input, null);
            this.current_headphone_device = ""
            return true
        }
        catch (e) {
            global.logError(`bad-bad horrible thing-thing happened : ${e}`)
            return false
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
