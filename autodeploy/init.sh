#!/bin/sh

npm config set prefix $PREFIX --global
npm install
npm link
