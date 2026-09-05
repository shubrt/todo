const fs = require("node:fs");
const path = require("node:path");
const {
  withInfoPlist,
  withEntitlementsPlist,
  withPodfileProperties,
  withXcodeProject,
} = require("expo/config-plugins");

const TARGET = "TodoHabitsWidget";
const unquote = (value) => String(value ?? "").replace(/^"|"$/g, "");
function iosVersion(...values) {
  return values.reduce((highest, value) => {
    const version = unquote(value);
    if (!/^\d+(\.\d+){0,2}$/.test(version)) return highest;
    const candidate = version.split(".").map(Number);
    const current = highest.split(".").map(Number);
    for (let index = 0; index < 3; index++) {
      if ((candidate[index] ?? 0) > (current[index] ?? 0)) return version;
      if ((candidate[index] ?? 0) < (current[index] ?? 0)) return highest;
    }
    return highest;
  }, "17.0");
}
const xml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function plistValue(value) {
  if (Array.isArray(value)) return `<array>${value.map(plistValue).join("")}</array>`;
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<integer>${value}</integer>`;
  if (value && typeof value === "object")
    return `<dict>${Object.entries(value)
      .map(([key, item]) => `<key>${xml(key)}</key>${plistValue(item)}`)
      .join("")}</dict>`;
  return `<string>${xml(value)}</string>`;
}
function writePlist(file, value) {
  fs.writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plistValue(value)}</plist>\n`,
  );
}

function cleanUndefined(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (
      item === undefined ||
      (item === "undefined" &&
        ["fileEncoding", "lastKnownFileType", "explicitFileType"].includes(key))
    )
      delete value[key];
    else cleanUndefined(item);
  }
}

function withTodoHabitSurfaces(config) {
  const appId = config.ios?.bundleIdentifier;
  if (!appId || !/^[A-Za-z0-9.-]+$/.test(appId))
    throw new Error("An iOS bundleIdentifier is required for Habit widgets.");
  const appGroup = `group.${appId}.habits`;
  const keychainGroup = `$(AppIdentifierPrefix)${appId}.habits`;
  const extensionId = `${appId}.habits-widget`;
  const minimumIOS = iosVersion(config.ios?.deploymentTarget);
  config.ios = { ...config.ios, deploymentTarget: minimumIOS };

  config = withPodfileProperties(config, (mod) => {
    mod.modResults["ios.deploymentTarget"] = iosVersion(
      minimumIOS,
      mod.modResults["ios.deploymentTarget"],
    );
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.TodoHabitAppGroup = appGroup;
    mod.modResults.TodoHabitKeychainGroup = keychainGroup;
    return mod;
  });
  config = withEntitlementsPlist(config, (mod) => {
    for (const [key, value] of [
      ["com.apple.security.application-groups", appGroup],
      ["keychain-access-groups", keychainGroup],
    ]) {
      const existing = mod.modResults[key];
      mod.modResults[key] = [...new Set([...(Array.isArray(existing) ? existing : []), value])];
    }
    return mod;
  });

  // EAS must sign the extension with the same App Group/Keychain entitlements.
  const eas = config.extra?.eas ?? {};
  const experimental = eas.build?.experimental ?? {};
  const extensions = (experimental.ios?.appExtensions ?? []).filter(
    (extension) => extension.targetName !== TARGET,
  );
  config.extra = {
    ...config.extra,
    eas: {
      ...eas,
      build: {
        ...eas.build,
        experimental: {
          ...experimental,
          ios: {
            ...experimental.ios,
            appExtensions: [
              ...extensions,
              {
                targetName: TARGET,
                bundleIdentifier: extensionId,
                entitlements: {
                  "com.apple.security.application-groups": [appGroup],
                  "keychain-access-groups": [keychainGroup],
                },
              },
            ],
          },
        },
      },
    },
  };

  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const destination = path.join(mod.modRequest.platformProjectRoot, TARGET);
    const source = path.join(mod.modRequest.projectRoot, "modules/todo-habit-surfaces/ios");
    fs.mkdirSync(destination, { recursive: true });
    const sources = [
      ["Shared/HabitModels.swift", "HabitModels.swift"],
      ["Shared/HabitStore.swift", "HabitStore.swift"],
      ["Shared/HabitIntents.swift", "HabitIntents.swift"],
      ["Widget/TodoHabitsWidget.swift", "TodoHabitsWidget.swift"],
    ];
    for (const [from, to] of sources)
      fs.copyFileSync(path.join(source, from), path.join(destination, to));
    writePlist(path.join(destination, "Info.plist"), {
      CFBundleDisplayName: "Habits",
      CFBundleExecutable: "$(EXECUTABLE_NAME)",
      CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
      CFBundleName: "$(PRODUCT_NAME)",
      CFBundlePackageType: "XPC!",
      CFBundleShortVersionString: "$(MARKETING_VERSION)",
      CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
      NSExtension: { NSExtensionPointIdentifier: "com.apple.widgetkit-extension" },
      TodoHabitAppGroup: appGroup,
      TodoHabitKeychainGroup: keychainGroup,
    });
    writePlist(path.join(destination, "TodoHabitsWidget.entitlements"), {
      "com.apple.security.application-groups": [appGroup],
      "keychain-access-groups": [keychainGroup],
    });

    // xcode.addTargetDependency silently skips dependencies unless both sections exist.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency ??= {};
    objects.PBXContainerItemProxy ??= {};
    const targets = project.pbxNativeTargetSection();
    const existing = Object.entries(targets).find(
      ([key, target]) => !key.endsWith("_comment") && unquote(target.name) === TARGET,
    );
    let target;
    if (existing) target = { uuid: existing[0], pbxNativeTarget: existing[1] };
    else {
      target = project.addTarget(TARGET, "app_extension", TARGET, extensionId);
      project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", target.uuid);
      project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);
      project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
      const group = project.addPbxGroup([], TARGET, TARGET);
      project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
      for (const [, filename] of sources)
        project.addSourceFile(filename, { target: target.uuid }, group.uuid);
      project.addFile("Info.plist", group.uuid);
      project.addFile("TodoHabitsWidget.entitlements", group.uuid);
    }
    const appTarget = Object.entries(targets).find(
      ([key, item]) =>
        !key.endsWith("_comment") &&
        unquote(item.productType) === "com.apple.product-type.application",
    );
    if (!appTarget) throw new Error("The Habit widget requires an iOS application target.");
    if (
      !appTarget[1].dependencies.some(
        ({ value }) => objects.PBXTargetDependency[value]?.target === target.uuid,
      )
    )
      project.addTargetDependency(appTarget[0], [target.uuid]);
    // The local Expo pod and interactive widget intents both require iOS 17.
    for (const configurationList of [
      project.getFirstProject().firstProject.buildConfigurationList,
      appTarget[1].buildConfigurationList,
    ]) {
      for (const { value } of project.pbxXCConfigurationList()[configurationList]
        .buildConfigurations) {
        const build = project.pbxXCBuildConfigurationSection()[value].buildSettings;
        build.IPHONEOS_DEPLOYMENT_TARGET = iosVersion(minimumIOS, build.IPHONEOS_DEPLOYMENT_TARGET);
      }
    }
    const list = project.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
    for (const { value } of list.buildConfigurations) {
      const build = project.pbxXCBuildConfigurationSection()[value].buildSettings;
      Object.assign(build, {
        PRODUCT_BUNDLE_IDENTIFIER: `"${extensionId}"`,
        PRODUCT_NAME: `"${TARGET}"`,
        INFOPLIST_FILE: `"${TARGET}/Info.plist"`,
        CODE_SIGN_ENTITLEMENTS: `"${TARGET}/TodoHabitsWidget.entitlements"`,
        IPHONEOS_DEPLOYMENT_TARGET: iosVersion(minimumIOS, build.IPHONEOS_DEPLOYMENT_TARGET),
        TARGETED_DEVICE_FAMILY: '"1,2"',
        SWIFT_VERSION: "5.9",
        SWIFT_OPTIMIZATION_LEVEL:
          project.pbxXCBuildConfigurationSection()[value].name === "Debug" ? '"-Onone"' : '"-O"',
        CLANG_ENABLE_MODULES: "YES",
        APPLICATION_EXTENSION_API_ONLY: "YES",
        SKIP_INSTALL: "YES",
        CODE_SIGN_STYLE: "Automatic",
        MARKETING_VERSION: mod.version ?? "0.1.0",
        CURRENT_PROJECT_VERSION: mod.ios?.buildNumber ?? "1",
        GENERATE_INFOPLIST_FILE: "NO",
      });
      if (mod.ios?.appleTeamId) build.DEVELOPMENT_TEAM = mod.ios.appleTeamId;
    }
    cleanUndefined(project.hash.project.objects);
    return mod;
  });
}

module.exports = withTodoHabitSurfaces;
