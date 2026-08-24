const axios = require('axios');

// Plugins වල තියෙන commands වලට අවශ්‍ය ප්‍රධාන function එක
const fetchJson = async (url, options) => {
    try {
        options ? options : {};
        const res = await axios({
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36'
            },
            ...options
        });
        return res.data;
    } catch (err) {
        return err;
    }
};

// අහඹු අකුරු/ඉලක්කම් සෑදීමට (උදා: temp files වලට)
const getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}${ext}`;
};

module.exports = { fetchJson, getRandom };