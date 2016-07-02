var util = require('util');
var bleno = require('bleno');

var BlenoPrimaryService = bleno.PrimaryService;

var PairingGeneralDataInputOutputCharacteristic = require('./paring-general-data-io-characteristic');

function KeyturnerPairingService() {
    KeyturnerPairingService.super_.call(this, {
        uuid: 'a92ee100-5501-11e4-916c-0800200c9a66',
        characteristics: [
            new PairingGeneralDataInputOutputCharacteristic()
        ]
    });
}

util.inherits(KeyturnerPairingService, BlenoPrimaryService);

module.exports = KeyturnerPairingService;
