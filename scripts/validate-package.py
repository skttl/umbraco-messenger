"""Validate the actual release archive without a running demo or credentials."""
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile


def validate(path, version):
    if not re.fullmatch(r"(17|18|19)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?", version):
        raise ValueError("Expected a stable or prerelease 17.x.y, 18.x.y or 19.x.y version")
    major = int(version.split(".")[0])
    expected_range = f"[{major}.0.0{'-rc1' if major == 19 else ''},{major + 1}.0.0)"
    framework = 'net11.0' if major == 19 else 'net10.0'
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate archive entries")
        specs = [n for n in names if n.endswith(".nuspec")]
        if len(specs) != 1:
            raise ValueError("Expected exactly one nuspec")
        metadata = ET.fromstring(archive.read(specs[0])).find("{*}metadata")
        if metadata is None or metadata.findtext("{*}id") != "Umbraco.Community.Messenger" or metadata.findtext("{*}version") != version:
            raise ValueError("Package identity/version mismatch")
        dependencies = [d for d in metadata.findall(".//{*}dependency") if d.get("id", "").startswith("Umbraco.Cms.")]
        if not dependencies or any("".join(d.get("version", "").split()) != expected_range for d in dependencies):
            raise ValueError(f"Expected bounded Umbraco dependency {expected_range}")
        required = {"README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "icon.png", "icon.svg",
                    f"lib/{framework}/Umbraco.Community.Messenger.dll",
                    "staticwebassets/App_Plugins/Messenger/messenger.js",
                    "staticwebassets/App_Plugins/Messenger/umbraco-package.json",
                    "staticwebassets/App_Plugins/Messenger/DEPENDENCY_LICENSES.txt"}
        if required.difference(names):
            raise ValueError(f"Missing files: {sorted(required.difference(names))}")
        allowed_roots = {"_rels", "package", "lib", "staticwebassets", "build", "buildMultiTargeting", "buildTransitive"}
        allowed_files = {specs[0], "[Content_Types].xml", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "icon.png", "icon.svg", ".signature.p7s"}
        sdk_build_files = {"build/Microsoft.AspNetCore.StaticWebAssets.targets",
                           "build/Umbraco.Community.Messenger.PackageAssets.json",
                           "build/Umbraco.Community.Messenger.targets",
                           "buildMultiTargeting/Umbraco.Community.Messenger.targets",
                           "buildTransitive/Umbraco.Community.Messenger.targets"} if major == 19 else set()
        for name in names:
            parts = pathlib.PurePosixPath(name).parts
            if ".." in parts or name.startswith("/") or (name not in allowed_files and parts[0] not in allowed_roots):
                raise ValueError(f"Unexpected archive content: {name}")
            lower = name.lower()
            if any(x in lower for x in ("appsettings", ".sqlite", ".db", "demousers", "node_modules", "/client/", "/demo/")):
                raise ValueError(f"Development data in package: {name}")
            if parts[0] == "lib" and name not in {f"lib/{framework}/Umbraco.Community.Messenger.dll", f"lib/{framework}/Umbraco.Community.Messenger.xml"}:
                raise ValueError(f"Unexpected library payload: {name}")
            if parts[0] == "staticwebassets" and (not name.startswith("staticwebassets/App_Plugins/Messenger/") or pathlib.PurePosixPath(name).suffix not in {".js", ".json", ".txt"}):
                raise ValueError(f"Unexpected static asset: {name}")
            if parts[0] in {"build", "buildMultiTargeting", "buildTransitive"} and pathlib.PurePosixPath(name).suffix != ".props" and name not in sdk_build_files:
                raise ValueError(f"Unexpected build payload: {name}")
        manifest = json.loads(archive.read("staticwebassets/App_Plugins/Messenger/umbraco-package.json"))
        if not manifest.get("extensions"):
            raise ValueError("Missing backoffice extensions")
    print(f"Validated {path}: {version}, {expected_range}, {len(names)} entries; no demo/settings/database files")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: validate-package.py PACKAGE VERSION")
    validate(pathlib.Path(sys.argv[1]), sys.argv[2])
