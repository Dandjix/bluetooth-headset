const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GUdev = imports.gi.GUdev;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');


async function get_battery(headset_device)
{
    try{

        const proc = Gio.Subprocess.new(
            ["bluetoothctl"],
            Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE |
            Gio.SubprocessFlags.STDERR_SILENCE
        );
        const input = [
            `info ${headset_device}`
        ].join('\n') + '\n';
        
        const [stdout] = await proc.communicate_utf8_async(input, null);
        
        const lines = stdout.split("\n")
        
        const prefix = "Battery Percentage: "
        const battery_lines = lines.filter((l) => l.trim().startsWith(prefix))
        
        if(battery_lines.length != 1) 
            return null;
        
        const line = battery_lines[0].trim()
        
        const level_hex = battery_lines[0].substring(prefix.length).split()[0].trim().split(' ')[0]
        
        const level_number = Number(level_hex)
        
        return level_number
    }
    catch(e)
    {
        return null
    }
}
/**
 * @param {string}  name - The name of the device to search for.
 * @return {string | undefined} The result bluetoothctl id, undefined if not found
 */
async function find_headset(name) {
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
        return undefined
    }
}

async function connect_headset(headset_device) {
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

async function turn_off_bluetooth() {
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

async function disconnect(){
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