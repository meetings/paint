#!/bin/bash

. $DEPLOYDIR/stage1.sh

git_upgrade && {
    say Version has not changed, exiting
    exit 0
}

npm update

install -m 0644 $DEPLOYDIR/$INTENT.conf /etc/init

initctl emit --no-wait theservicestart

say Githupdate done.
