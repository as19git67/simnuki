# simnuki
Simulates a Nuki.io Smart Lock (runs on Raspberry PI on node.js - needs bluetooth dongle on Raspberry PI < 3)
The official nuki app can pair with it and some actions can be performed like lock, unlock.

Note that this code is preliminary and my cause unexpected results.

# Installation
I'm running the nuki smart lock simulator on a Raspberry PI 2 and on a Raspberry PI 3 with node.js version 4.4.4 and on the PI 2 there is a bluetooth dongle connected via USB.

## Install Node.js

```sh
wget https://nodejs.org/dist/v4.4.4/node-v4.4.4-linux-armv6l.tar.gz (Raspberry PI 2)
wget https://nodejs.org/dist/v4.4.4/node-v4.4.4-linux-armv7l.tar.gz (Raspberry PI 3)

tar xvfz node-v4.4.4-linux-armvXl.tar.gz
cd node-v4.4.4-linux-armvXl
sudo cp -R * /usr/local/
```
## Bluetooth connection

```sh
sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
```

### Running without root/sudo

Run the following command:

```sh
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)
```

This grants the ```node``` binary ```cap_net_raw``` privileges, so it can start/stop BLE advertising.

__Note:__ The above command requires ```setcap``` to be installed, it can be installed using the following:

 * apt: ```sudo apt-get install libcap2-bin```

(see https://github.com/sandeepmistry/noble#running-on-linux)

### Tool Dependencies
Some of the npm modules need to be compiled natively and for this libtool is needed.

```sh
sudo apt-get install libtool
```

## Get node modules
In the cloned repository run:
```sh
npm install
```

## Run it
To run the simulator, call node with main.js. It advertises a nuki smart lock via Bluetooth and the Nuki app (tried with iOS) can pair and do lock and unlock operations. Note, that not all of the Nuki API is implemented. For example, adding additional users is not there currently.

There is also the counterpart for it: a simulator of a client: https://github.com/as19git67/simnukifob which can be used on a second Raspberry PI to simulate the Nuki app.

```sh
node main.js
```
