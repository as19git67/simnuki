var util = require('util');
var bleno = require('bleno');
var SerialNumberCharacteristic = require('./serial-number-characteristic');

var BlenoPrimaryService = bleno.PrimaryService;

function KeyturnerInitializationService() {
    KeyturnerInitializationService.super_.call(this, {
        uuid: 'a92ee000-5501-11e4-916c-0800200c9a66',
        characteristics: [
            new SerialNumberCharacteristic()
        ]
    });
}

util.inherits(KeyturnerInitializationService, BlenoPrimaryService);

module.exports = KeyturnerInitializationService;
