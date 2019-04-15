#!/bin/bash
set -e

scriptDirectory=$(dirname "$0")
scriptDirectory=$(realpath "$scriptDirectory")
rootDirectory="$scriptDirectory/.."
cd "$rootDirectory";

for library in $(ls libraries); do
	if [[ $library == "common" ]]; then continue; fi
	libraryDirectory="$rootDirectory/libraries/$library"
	NODE_ENV=production npx webpack "$libraryDirectory/src/main.js" -o "$libraryDirectory/dist/main.js" --mode production
done
