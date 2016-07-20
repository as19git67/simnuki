var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var nconf = require('nconf');
var bleno = require('bleno');
var sodium = require('sodium');
var uuid = require('uuid');


var config = new nconf.Provider({
    env: true,
    argv: true,
    store: {
        type: 'file',
        file: path.join(__dirname, 'config.json')
    }
});

var strUuid = config.get('uuid');
if (!(strUuid && _.isString(strUuid) && strUuid.length === 32)) {
    var arrUUID = new Array(16);
    uuid.v1(null, arrUUID);
    config.set('uuid', new Buffer(arrUUID).toString('hex'));
    config.save(function (err) {
        if (err) {
            console.log("Writing configuration failed", err);
        } else {
            console.log("Initial configuration saved");
        }
    });
} else {
    console.log("SL UUID: " + strUuid);
}


// todo: read from file or generate keys if not in file
var publicKeySample = "2FE57DA347CD62431528DAAC5FBB290730FFF684AFC4CFC2ED90995F58CB3B74";
var secretKeySample = "012345265462465716596ABCDEF1599297ADFFE75685365578954446435BACA1";

var keys = {
    slPk: null,
    slSk: null,
    clPk: null
};

var KeyturnerInitializationService = require('./keyturner-initialization-service');
var KeyturnerPairingService = require('./keyturner-pairing-service');
var KeyturnerService = require('./keyturner-service');

var keyturnerInitializationService = new KeyturnerInitializationService();
var keyturnerPairingService = new KeyturnerPairingService(keys, config);
var keyturnerService = new KeyturnerService(keys, config);


bleno.on('stateChange', function (state) {
    console.log('on -> stateChange: ' + state);

    if (state === 'poweredOn') {
        // bleno.startAdvertising('SimNuki', [keyturnerPairingService.uuid]);

        var testBuf = new Buffer("0201061521669a0c2000086c91e411015500e12ea92000001b0e094e756b695f3230303030303142", 'hex');
        var uuidBuf = new Buffer(keyturnerPairingService.uuid, 'hex');
        var serviceDataBuf = new Buffer('2000001B', 'hex');
        console.log("Advertise with EIR Data:", uuidBuf, serviceDataBuf);
        bleno.startAdvertisingWithEIRData(testBuf, serviceDataBuf, function (err) {
            console.log("Advertising started", err);
        });
    } else {
        bleno.stopAdvertising();
    }
});

bleno.on('advertisingStart', function (error) {
    console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    if (!error) {
        bleno.setServices([
            keyturnerInitializationService,
            keyturnerPairingService,
            keyturnerService
        ]);
    }
});

bleno.on('accept', function (address) {
    console.log('on -> accept: ' + address);
    console.log("Creating new SL key pair...");
    var slKeys = new sodium.Key.ECDH();
    keys.slPk = slKeys.pk().get();
    keys.slSk = slKeys.sk().get();
    keyturnerPairingService = new KeyturnerPairingService(keys, config);
    bleno.setServices([
        keyturnerInitializationService,
        keyturnerPairingService,
        keyturnerService
    ]);
});

bleno.on('disconnect', function () {
    console.log('on -> disconnect');
});

bleno.on('mtuChange', function (mtu) {
    console.log('on -> mtuChange: ' + mtu);
});

bleno.on('servicesSet', function (error) {
    console.log('on -> servicesSet: ' + (error ? 'error ' + error : 'success'));
});

bleno.on('readRequest', function (offset) {
    console.log('on -> readRequest at offset ' + offset);
});

bleno.on('writeRequest', function (offset) {
    console.log('on -> writeRequest at offset ' + offset);
});

bleno.on('notify', function () {
    console.log('on -> notify');
});

bleno.on('indicate', function () {
    console.log('on -> indicate');
});

bleno.on('subscribe', function (offset) {
    console.log('on -> subscribe');
});

bleno.on('unsubscribe', function (offset) {
    console.log('on -> unsubscribe');
});

