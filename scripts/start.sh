#!/bin/bash
scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";
for library in $(ls libraries); do
	libraryDirectory="$rootDirectory/libraries/$library"
	npx webpack "$libraryDirectory/src/main.js" -o "$libraryDirectory/dist/main.js" --mode development -w &
done
npx browser-sync start -s -w --no-open --no-notify --no-ghost-ui --directory &
trap 'trap - SIGTERM && kill 0' SIGINT SIGTERM EXIT
wait