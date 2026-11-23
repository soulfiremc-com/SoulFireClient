import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { PathAccess, isPathWithin, withFilterExtension } from "./path-access";

const root = path.resolve("/app/config");

test("paths inside the app directory are allowed and traversal is blocked", () => {
  const access = new PathAccess(() => [root]);
  assert.equal(
    access.resolve(path.join(root, "profiles", "a.json")),
    path.join(root, "profiles", "a.json"),
  );
  assert.equal(access.resolve(root), root);
  assert.throws(() =>
    access.resolve(path.join(root, "profiles", "..", "..", "secret")),
  );
  assert.throws(() => access.resolve(`${root}-other/file`));
  assert.throws(() => access.resolve(path.resolve("/home/user/.bashrc")));
  assert.throws(() => access.resolve(42));
  assert.throws(() => access.resolve(""));
});

test("dialog picks grant only the chosen file or directory", () => {
  const access = new PathAccess(() => [root]);
  const picked = path.resolve("/home/user/Downloads/accounts.txt");
  const sibling = path.resolve("/home/user/Downloads/other.txt");
  assert.throws(() => access.resolve(picked));
  access.grantFile(picked);
  assert.equal(access.resolve(picked), picked);
  assert.equal(access.isGrantedFile(picked), true);
  assert.throws(() => access.resolve(sibling));

  const directory = path.resolve("/home/user/exports");
  access.grantDirectory(directory);
  assert.equal(
    access.resolve(path.join(directory, "a.txt")),
    path.join(directory, "a.txt"),
  );
  assert.equal(access.isGrantedFile(path.join(directory, "a.txt")), false);
});

test("a name that starts with two dots stays inside the root", () => {
  assert.equal(isPathWithin(root, path.join(root, "..hidden")), true);
  assert.equal(isPathWithin(root, path.dirname(root)), false);
});

test("save dialog paths get the filter extension only when it is missing", () => {
  const filters = [{ extensions: ["json"] }];
  assert.equal(withFilterExtension("/a/profile", filters), "/a/profile.json");
  assert.equal(
    withFilterExtension("/a/profile.json", filters),
    "/a/profile.json",
  );
  // A renderer that appended ".json" again would write to an ungranted path.
  assert.equal(
    withFilterExtension("/a/Profile.JSON", filters),
    "/a/Profile.JSON",
  );
  assert.equal(
    withFilterExtension("/a/notes", [{ extensions: ["*"] }]),
    "/a/notes",
  );
  assert.equal(withFilterExtension("/a/notes"), "/a/notes");
});
