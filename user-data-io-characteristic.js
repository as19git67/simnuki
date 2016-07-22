var util = require('util');
var crc = require('crc');
var nukiConstants = require('./nuki-constants');
var _ = require('underscore');
var sodium = require('sodium');

var bleno = require('bleno');
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;

function UserSpecificDataInputOutputCharacteristic(keys, config) {
    UserSpecificDataInputOutputCharacteristic.super_.call(this, {
        // uuid: 'a92ee202-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee202550111e4916c0800200c9a66',
        properties: ['write', 'indicate'],
        descriptors: [
            new BlenoDescriptor({
                uuid: '2902',   // client characterstic configuration
                value: 'set a value'
            })
        ]
    });
    this.keys = keys;
    this.config = config;
}

util.inherits(UserSpecificDataInputOutputCharacteristic, BlenoCharacteristic);

UserSpecificDataInputOutputCharacteristic.prototype.onWriteRequest = function (data, offset, withoutResponse, callback) {
    console.log("UserSpecificDataInputOutputCharacteristic write:", data);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG);
    } else if (data.length > 200) {
        callback(this.RESULT_INVALID_ATTRIBUTE_LENGTH);
    } else {
        var nonce = data.slice(0, 24);
        var authorizationId = data.readUInt32LE(24);
        var messageLen = data.readUInt16LE(28);
        var encryptedMessage = data.slice(30);

        var users = this.config.get("users");
        if (users) {

            var user = users[authorizationId];
            // user object contains:
            //  authorizationId: newAuthorizationId,
            //  name: name,
            //  appId: appId,
            //  appType: appType,
            //  sharedSecret: this.keys.sharedSecret.toString('hex')

            if (user.sharedSecret) {
                var sharedSecret = new Buffer(user.sharedSecret, 'hex');

                console.log("message len: " + messageLen + ", encrypted message len: " + encryptedMessage.length);

                var decryptedMessge = sodium.api.crypto_secretbox_open(encryptedMessage, nonce, sharedSecret);
                console.log("decrypted message: ", decryptedMessge);

                if (nukiConstants.crcOk(decryptedMessge)) {
                    console.log("CRC ok");
                    var authorizationIdFromEncryptedMessage = decryptedMessge.readUInt32LE(0);
                    var cmdId = decryptedMessge.readUInt16LE(4);
                    console.log("command id: 0x" + cmdId.toString('hex'));
                    var payload = decryptedMessge.slice(5, decryptedMessge.length - 2);
                    console.log("payload", payload);
                    /*
                     UserSpecificDataInputOutputCharacteristic write: <Buffer c6 5e f5 b4 44 b3 09 62 31 58 ae 6e 5e bd 28 e3 0e 89 90 99 75 cb 3b 39 08 00 00 00 1a 00 c3 98 22 2c d7 57 bf 82 4b cf 21 79 99 f1 04 e0 5e 79 fa f0 ... >
                     UserSpecificDataInputOutputCharacteristic write: <Buffer b0 38 af b2 84 00 34 3f f2 75 c6 0c ee 2f a9 1e 8e 20 94 2b 56 8d 3c 60 08 00 00 00 1a 00 64 54 bb b2 89 4e 23 d6 28 d2 9b 12 7d 50 bc b8 65 fb 25 30 ... >
                     UserSpecificDataInputOutputCharacteristic write: <Buffer 8c 46 69 78 39 d1 e4 06 f8 3b a7 a0 16 af 26 cf 5b d6 7b ea 8d a3 2b 4b 08 00 00 00 18 00 18 0e fc 95 5c d4 e6 b7 bf ed 14 7d 10 cf af c8 05 53 58 26 ... >
                     UserSpecificDataInputOutputCharacteristic write: <Buffer 71 69 78 68 15 13 2d 5e b5 3a 2a bc 71 3e 0b f9 4b 25 41 12 01 98 8a e9 08 00 00 00 1a 00 10 66 fa 6c d6 d3 f2 f0 c3 9d 40 85 52 f3 d7 61 c5 85 c3 24 ... >
                     */
                    callback(this.RESULT_SUCCESS);
                } else {
                    console.log("ERROR: crc not ok");
                    callback(this.RESULT_UNLIKELY_ERROR);
                }
            } else {
                console.log("ERROR: don't have sharedSecret in config for authorization-id " + authorizationId);
                callback(this.RESULT_UNLIKELY_ERROR);
            }
        } else {
            console.log("WARNING: don't have users stored in config");
            callback(this.RESULT_UNLIKELY_ERROR);
        }
    }
};

UserSpecificDataInputOutputCharacteristic.prototype.onReadRequest = function (offset, callback) {
    console.log("UserSpecificDataInputOutputCharacteristic GET requested", offset);
    if (offset) {
        callback(this.RESULT_ATTR_NOT_LONG, null);
    }
    else {
        var data = new Buffer(2);
        data.writeUInt16BE(1, 0);
        callback(this.RESULT_SUCCESS, data);
    }
};

module.exports = UserSpecificDataInputOutputCharacteristic;
