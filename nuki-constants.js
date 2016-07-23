var crc = require('crc');

// Nuki protocol constants
module.exports.CMD_REQUEST_DATA = 0x01;
module.exports.CMD_ID_PUBLIC_KEY = 0x03;
module.exports.CMD_CHALLENGE = 0x04;
module.exports.CMD_AUTHORIZATION_AUTHENTICATOR = 0x05;
module.exports.CMD_AUTHORIZATION_DATA = 0x06;
module.exports.CMD_AUTHORIZATION_ID = 0x07;
module.exports.CMD_AUTHORIZATION_ID_CONFIRMATION = 0x1E;
module.exports.CMD_STATUS = 0x0E;
module.exports.CMD_NUKI_STATES = 0x0C;
module.exports.CMD_REQUEST_CONFIG = 0x14;
module.exports.CMD_CONFIG = 0x15;
module.exports.CMD_VERIFY_PIN = 0x20;
module.exports.CMD_UPDATE_TIME = 0x21;

module.exports.STATUS_COMPLETE = 0x00;
module.exports.STATUS_ACCEPTED = 0x01;

module.exports.NUKI_NONCEBYTES = 32;

module.exports.crcOk = function (dataTocheck) {
    var dataForCrc = dataTocheck.slice(0, dataTocheck.length - 2);
    var crcSumCalc = crc.crc16ccitt(dataForCrc);
    var crcSumRetrieved = dataTocheck.readUInt16LE(dataTocheck.length - 2);
    return crcSumCalc === crcSumRetrieved;
};
