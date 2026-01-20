#!/bin/sh

cd space-command
npm run build
cd ..

cp -pr space-command ~/writing/development-notes/.obsidian/plugins

cp -pr space-command ~/writing/nb-notes/.obsidian/plugins   