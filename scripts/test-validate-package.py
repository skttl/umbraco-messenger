import contextlib
import importlib.util
import io
import pathlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("validator", pathlib.Path(__file__).with_name("validate-package.py"))
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class PackageValidationTests(unittest.TestCase):
    def package(self, directory, extra=None, dependency="[18.0.0,19.0.0)"):
        path = pathlib.Path(directory) / "fixture.nupkg"
        files = {name: b"test" for name in ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "icon.png", "icon.svg",
                 "lib/net10.0/Umbraco.Community.Messenger.dll", "staticwebassets/App_Plugins/Messenger/messenger.js",
                 "staticwebassets/App_Plugins/Messenger/DEPENDENCY_LICENSES.txt"]}
        files["staticwebassets/App_Plugins/Messenger/umbraco-package.json"] = b'{"extensions":[{}]}'
        files["Messenger.nuspec"] = f'<package><metadata><id>Umbraco.Community.Messenger</id><version>18.0.0</version><dependencies><dependency id="Umbraco.Cms.Api.Management" version="{dependency}" /></dependencies></metadata></package>'.encode()
        files.update(extra or {})
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        return path

    def test_valid_archive(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            validator.validate(self.package(directory), "18.0.0")

    def test_rejects_development_data_even_in_static_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.package(directory, {"staticwebassets/appsettings.Local.json": b"secret"})
            with self.assertRaisesRegex(ValueError, "Development data"):
                validator.validate(path, "18.0.0")

    def test_rejects_wrong_major_dependency(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.package(directory, dependency="[17.0.0,18.0.0)")
            with self.assertRaisesRegex(ValueError, "bounded Umbraco"):
                validator.validate(path, "18.0.0")

    def test_rejects_unexpected_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.package(directory, {"src/Unshipped.cs": b"source"})
            with self.assertRaisesRegex(ValueError, "Unexpected archive"):
                validator.validate(path, "18.0.0")

    def test_rejects_source_hidden_in_library_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.package(directory, {"lib/net10.0/Source.cs": b"source"})
            with self.assertRaisesRegex(ValueError, "Unexpected library"):
                validator.validate(path, "18.0.0")


if __name__ == "__main__":
    unittest.main()
