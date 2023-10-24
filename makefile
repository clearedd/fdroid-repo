sdkmanager := ./android/tools/bin/sdkmanager
androidVersion:=28# sdk/api https://apilevels.com / https://developer.android.com/ndk/guides/sdk-versions
ndkVer := 25.2.9519653
buildToolVer := 34.0.0-rc3

log:
	@echo -e '\033[0;36m############### Logs ###############\033[0m'
	adb logcat -v color -v brief --pid=$(shell adb shell ps | grep org.fdroid.fdroid | grep -oE '[0-9]+' | sed -n '3p')

install:
	@if [ ! -e "./android" ]; then \
        echo "Downloading android sdk..."; \
		curl https://dl.google.com/android/repository/sdk-tools-linux-3859397.zip -s -o ./sdk-tools.zip ; \
		unzip ./sdk-tools.zip ; \
		rm ./sdk-tools.zip ; \
		\
		mkdir android ; \
		mv ./tools ./android/tools ; \
		sudo archlinux-java set java-8-openjdk ; \
		# apkanalyzer \
		$(sdkmanager) --verbose "cmdline-tools;latest" ; \
		sudo archlinux-java set java-20-openjdk ; \
		echo "Download complete."; \
	fi
	@if [ ! -e "./android/build-tools/$(buildToolVer)" ]; then \
		sudo archlinux-java set java-8-openjdk ; \
		echo -e '\033[0;36mBuild tools $(buildToolVer)\033[0m' ; \
		$(sdkmanager) --verbose "build-tools;$(buildToolVer)" ; \
		sudo archlinux-java set java-20-openjdk ; \
	fi

update:
	$(sdkmanager) --update --verbose

list:
	$(sdkmanager) --list
