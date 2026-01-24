var commands = [];

function cmd(info, func) {
    var data = info;
    data.function = func;
    if (!data.dontAddCommandList) data.dontAddCommandList = false;
    if (!info.desc) data.desc = '';
    if (!info.fromMe) data.fromMe = false;
    if (!info.category) data.category = 'misc';
    if (!info.filename) data.filename = 'not_found';
    commands.push(data);
    return data;
}

module.exports = {
    cmd,
    commands
};