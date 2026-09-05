import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExpoConfig } from "expo/config";
import { IOSConfig, type ExportedConfig, type Mod, type XcodeProject } from "expo/config-plugins";
import { afterEach, describe, expect, it } from "vite-plus/test";

const require = createRequire(import.meta.url);
const withHabitSurfaces: (
  config: ExpoConfig,
) => ExportedConfig = require("../plugins/withTodoHabitSurfaces.cjs");
const expoRequire = createRequire(require.resolve("expo/config-plugins"));
const pluginRequire = createRequire(expoRequire.resolve("@expo/config-plugins"));
const plist: { parse: (source: string) => unknown } = pluginRequire("@expo/plist").default;
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const folders: string[] = [];
const targetName = "TodoHabitsWidget";
const appGroup = "group.dev.shubrt.test.habits";
const keychainGroup = "$(AppIdentifierPrefix)dev.shubrt.test.habits";
const sources = [
  "HabitModels.swift",
  "HabitStore.swift",
  "HabitIntents.swift",
  "TodoHabitsWidget.swift",
];
const unquote = (value: unknown) => String(value).replace(/^"|"$/g, "");

function config(): ExportedConfig {
  return withHabitSurfaces({
    name: "Test",
    slug: "test",
    version: "2.3.4",
    ios: { bundleIdentifier: "dev.shubrt.test", buildNumber: "42", appleTeamId: "TEAM123456" },
  });
}

async function runMod<T>(
  mod: Mod<T> | undefined,
  config: ExportedConfig,
  results: T,
  platformRoot: string,
  name: string,
) {
  if (!mod) throw new Error(`Missing ${name} mod`);
  return (
    await mod({
      ...config,
      modResults: results,
      modRawConfig: config,
      modRequest: {
        projectRoot,
        platformProjectRoot: platformRoot,
        platform: "ios",
        modName: name,
        introspect: false,
      },
    })
  ).modResults;
}

function fixture() {
  const folder = mkdtempSync(path.join(tmpdir(), "todo-widget-plugin-"));
  folders.push(folder);
  const ios = path.join(folder, "ios");
  const pbxPath = path.join(ios, "HelloWorld.xcodeproj", "project.pbxproj");
  mkdirSync(path.dirname(pbxPath), { recursive: true });
  // Use the installed Expo template so a template/library upgrade exercises actual PBX behavior.
  const template = execFileSync("tar", [
    "-xOf",
    require.resolve("expo/template.tgz"),
    "package/ios/HelloWorld.xcodeproj/project.pbxproj",
  ]);
  writeFileSync(pbxPath, template);
  return { folder, ios, pbxPath, project: IOSConfig.XcodeUtils.getPbxproj(folder) };
}

function targets(project: XcodeProject) {
  type Target = {
    name: string;
    productType: string;
    productReference: string;
    buildConfigurationList: string;
    dependencies: { value: string }[];
    buildPhases: { value: string }[];
  };
  return Object.entries(project.pbxNativeTargetSection() as Record<string, Target>).filter(
    ([id]) => !id.endsWith("_comment"),
  );
}

function assertLinked(project: XcodeProject) {
  const nativeTargets = targets(project);
  const widgetTargets = nativeTargets.filter(([, target]) => unquote(target.name) === targetName);
  expect(widgetTargets).toHaveLength(1);
  const [widgetId, widget] = widgetTargets[0]!;
  const [, app] = nativeTargets.find(
    ([, target]) => unquote(target.productType) === "com.apple.product-type.application",
  )!;
  const objects = project.hash.project.objects;
  const dependency = app.dependencies.filter(
    ({ value }: { value: string }) => objects.PBXTargetDependency[value]?.target === widgetId,
  );
  expect(dependency).toHaveLength(1);
  const proxyId = objects.PBXTargetDependency[dependency[0]!.value].targetProxy;
  expect(objects.PBXContainerItemProxy[proxyId].remoteGlobalIDString).toBe(widgetId);

  const embedReferences = app.buildPhases
    .flatMap(({ value }: { value: string }) => {
      const phase = objects.PBXCopyFilesBuildPhase[value];
      return phase?.dstSubfolderSpec === 13 ? phase.files : [];
    })
    .filter(
      ({ value }: { value: string }) =>
        objects.PBXBuildFile[value]?.fileRef === widget.productReference,
    );
  expect(embedReferences).toHaveLength(1);
  const sourcePhases = widget.buildPhases
    .map(({ value }: { value: string }) => objects.PBXSourcesBuildPhase[value])
    .filter(Boolean);
  expect(sourcePhases).toHaveLength(1);
  const sourcePaths = sourcePhases[0].files.map(({ value }: { value: string }) =>
    unquote(objects.PBXFileReference[objects.PBXBuildFile[value].fileRef].path),
  );
  expect(sourcePaths.sort()).toEqual([...sources].sort());
  expect(sourcePaths).not.toContain("TodoHabitSurfacesModule.swift");
  const settings = objects.XCConfigurationList[
    widget.buildConfigurationList
  ].buildConfigurations.map(
    ({ value }: { value: string }) => objects.XCBuildConfiguration[value].buildSettings,
  );
  expect(settings).toHaveLength(2);
  for (const build of settings) {
    expect(unquote(build.PRODUCT_BUNDLE_IDENTIFIER)).toBe("dev.shubrt.test.habits-widget");
    expect(unquote(build.CODE_SIGN_ENTITLEMENTS)).toBe(
      "TodoHabitsWidget/TodoHabitsWidget.entitlements",
    );
    expect(unquote(build.INFOPLIST_FILE)).toBe("TodoHabitsWidget/Info.plist");
    expect(build.APPLICATION_EXTENSION_API_ONLY).toBe("YES");
    expect(build.SKIP_INSTALL).toBe("YES");
    expect(build.SWIFT_VERSION).toBe("5.9");
    expect(build.IPHONEOS_DEPLOYMENT_TARGET).toBe("17.0");
    expect(build.DEVELOPMENT_TEAM).toBe("TEAM123456");
    expect(build.MARKETING_VERSION).toBe("2.3.4");
    expect(unquote(build.CURRENT_PROJECT_VERSION)).toBe("42");
  }
  return widgetId;
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("iOS habit widget Expo plugin", () => {
  it("preserves other capabilities and exposes exactly one matching EAS extension before prebuild", async () => {
    const initial = config();
    initial.extra!.eas.build.experimental.ios.appExtensions.unshift({
      targetName: "Other",
      bundleIdentifier: "dev.test.other",
    });
    const second = withHabitSurfaces(initial);
    const extensions = second.extra!.eas.build.experimental.ios.appExtensions;
    expect(extensions).toHaveLength(2);
    expect(
      extensions.find((item: { targetName: string }) => item.targetName === targetName),
    ).toEqual({
      targetName,
      bundleIdentifier: "dev.shubrt.test.habits-widget",
      entitlements: {
        "com.apple.security.application-groups": [appGroup],
        "keychain-access-groups": [keychainGroup],
      },
    });
    const info = await runMod(
      second.mods?.ios?.infoPlist,
      second,
      { CFBundleDisplayName: "Existing", NSCameraUsageDescription: "Scan a device connection" },
      "/unused",
      "infoPlist",
    );
    expect(info).toMatchObject({
      CFBundleDisplayName: "Existing",
      NSSupportsLiveActivities: true,
      TodoHabitAppGroup: appGroup,
      TodoHabitKeychainGroup: keychainGroup,
    });
    const entitlements = await runMod(
      second.mods?.ios?.entitlements,
      second,
      {
        "com.apple.security.application-groups": ["group.other", appGroup],
        "keychain-access-groups": ["$(AppIdentifierPrefix)existing"],
        "aps-environment": "development",
      },
      "/unused",
      "entitlements",
    );
    expect(entitlements).toEqual({
      "com.apple.security.application-groups": ["group.other", appGroup],
      "keychain-access-groups": ["$(AppIdentifierPrefix)existing", keychainGroup],
      "aps-environment": "development",
    });
    const malformed = await runMod(
      second.mods?.ios?.entitlements,
      second,
      { "keychain-access-groups": "invalid scalar" },
      "/unused",
      "entitlements",
    );
    expect(malformed["keychain-access-groups"]).toEqual([keychainGroup]);
  });

  it("builds and embeds the extension once across serialized prebuild runs with matching signed storage", async () => {
    const f = fixture();
    const first = config();
    expect(first.ios?.deploymentTarget).toBe("17.0");
    const podProperties = await runMod(
      first.mods?.ios?.podfileProperties,
      first,
      { "ios.deploymentTarget": "16.4", "expo.jsEngine": "hermes" },
      f.ios,
      "podfileProperties",
    );
    expect(podProperties).toEqual({ "ios.deploymentTarget": "17.0", "expo.jsEngine": "hermes" });
    const project = await runMod(first.mods?.ios?.xcodeproj, first, f.project, f.ios, "xcodeproj");
    expect(project.writeSync().match(/IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/g)).toHaveLength(6);
    const widgetId = assertLinked(project);
    writeFileSync(f.pbxPath, project.writeSync());
    const second = config();
    const regenerated = await runMod(
      second.mods?.ios?.xcodeproj,
      second,
      IOSConfig.XcodeUtils.getPbxproj(f.folder),
      f.ios,
      "xcodeproj",
    );
    expect(assertLinked(regenerated)).toBe(widgetId);
    expect(regenerated.writeSync()).toBe(project.writeSync());
    expect(regenerated.writeSync()).not.toContain("= undefined;");
    const destination = path.join(f.ios, targetName);
    const info = plist.parse(readFileSync(path.join(destination, "Info.plist"), "utf8"));
    expect(info).toMatchObject({
      NSExtension: { NSExtensionPointIdentifier: "com.apple.widgetkit-extension" },
      TodoHabitAppGroup: appGroup,
      TodoHabitKeychainGroup: keychainGroup,
    });
    expect(
      plist.parse(readFileSync(path.join(destination, `${targetName}.entitlements`), "utf8")),
    ).toEqual(first.extra!.eas.build.experimental.ios.appExtensions[0].entitlements);
    for (const filename of sources) {
      const sourceFolder = filename === "TodoHabitsWidget.swift" ? "Widget" : "Shared";
      expect(readFileSync(path.join(destination, filename), "utf8")).toBe(
        readFileSync(
          path.join(projectRoot, "modules/todo-habit-surfaces/ios", sourceFolder, filename),
          "utf8",
        ),
      );
    }
  });

  it("respects a higher configured iOS minimum and preserves existing higher deployment targets", async () => {
    const f = fixture();
    const initial = config();
    const higher = withHabitSurfaces({
      ...initial,
      ios: { ...initial.ios, deploymentTarget: "18.2" },
    });
    expect(higher.ios?.deploymentTarget).toBe("18.2");
    const podProperties = await runMod(
      higher.mods?.ios?.podfileProperties,
      higher,
      {},
      f.ios,
      "podfileProperties",
    );
    expect(podProperties["ios.deploymentTarget"]).toBe("18.2");
    const existingPodProperties = await runMod(
      higher.mods?.ios?.podfileProperties,
      higher,
      { "ios.deploymentTarget": "19.1" },
      f.ios,
      "podfileProperties",
    );
    expect(existingPodProperties["ios.deploymentTarget"]).toBe("19.1");
    const project = await runMod(
      higher.mods?.ios?.xcodeproj,
      higher,
      f.project,
      f.ios,
      "xcodeproj",
    );
    expect(project.writeSync().match(/IPHONEOS_DEPLOYMENT_TARGET = 18\.2;/g)).toHaveLength(6);
    const [firstAppConfiguration] =
      project.pbxXCConfigurationList()[targets(project)[0]![1].buildConfigurationList]
        .buildConfigurations;
    project.pbxXCBuildConfigurationSection()[
      firstAppConfiguration.value
    ].buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "19.0";
    const repeated = withHabitSurfaces({
      ...initial,
      ios: { ...initial.ios, deploymentTarget: "18.2" },
    });
    await runMod(repeated.mods?.ios?.xcodeproj, repeated, project, f.ios, "xcodeproj");
    expect(
      project.pbxXCBuildConfigurationSection()[firstAppConfiguration.value].buildSettings
        .IPHONEOS_DEPLOYMENT_TARGET,
    ).toBe("19.0");
  });

  it("repairs a previously generated project missing the app-to-widget dependency", async () => {
    const f = fixture();
    const initial = config();
    const project = await runMod(
      initial.mods?.ios?.xcodeproj,
      initial,
      f.project,
      f.ios,
      "xcodeproj",
    );
    for (const [, target] of targets(project)) target.dependencies = [];
    delete project.hash.project.objects.PBXTargetDependency;
    delete project.hash.project.objects.PBXContainerItemProxy;
    const repaired = config();
    await runMod(repaired.mods?.ios?.xcodeproj, repaired, project, f.ios, "xcodeproj");
    assertLinked(project);
  });
});
