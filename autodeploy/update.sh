#!/bin/bash

. $DEPLOYDIR/stage1.sh

git_upgrade && {
    say Version has not changed, exiting
    exit 0
}

npm update

say Installing Upstart script
install -m 0644 $DEPLOYDIR/$INTENT.conf /etc/init

say Restarting service
service $INTENT restart

say Githupdate done.
