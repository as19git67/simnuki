var bleno = require('bleno');

var KeyturnerInitializationService = require('./keyturner-initialization-service');
var KeyturnerPairingService = require('./keyturner-pairing-service');

var keyturnerInitializationService = new KeyturnerInitializationService();

bleno.on('stateChange', function(state) {
    console.log('on -> stateChange: ' + state);

    if (state === 'poweredOn') {
        bleno.startAdvertising('NukiSim', [keyturnerInitializationService.uuid]);
    } else {
        bleno.stopAdvertising();
    }
});

bleno.on('advertisingStart', function(error) {
    console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    if (!error) {
        bleno.setServices([
            keyturnerInitializationService,
            new KeyturnerPairingService()
        ]);
    }
});