var util = require('util');
var bleno = require('bleno');

var BlenoPrimaryService = bleno.PrimaryService;

var PairingGeneralDataInputOutputCharacteristic = require('./pairing-general-data-io-characteristic');

function KeyturnerPairingService(keys) {
    KeyturnerPairingService.super_.call(this, {
        // uuid: 'a92ee100-5501-11e4-916c-0800200c9a66',
        uuid: 'a92ee100550111e4916c0800200c9a66',
        characteristics: [
            new PairingGeneralDataInputOutputCharacteristic(keys)
        ]
    });
}

util.inherits(KeyturnerPairingService, BlenoPrimaryService);

module.exports = KeyturnerPairingService;
