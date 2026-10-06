'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

function profilePath(name, home = os.homedir()) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) throw new Error('Invalid profile name');
  return path.join(home, '.mission-control', 'profiles', `${name}.json`);
}

function checkedStat(file, directory = false, requirePrivate = true) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()) ||
      (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('Profile storage must be owned regular files and directories, without symlinks');
  }
  if (requirePrivate && (stat.mode & 0o077)) throw new Error('Profile storage must be private to its owner');
  return stat;
}

function privateDirectories(file, create) {
  const profiles = path.dirname(file);
  for (const dir of [path.dirname(profiles), profiles]) {
    try { checkedStat(dir, true, !create); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return false;
      fs.mkdirSync(dir, { mode: 0o700 });
      checkedStat(dir, true, false);
    }
    if (create) fs.chmodSync(dir, 0o700);
  }
  return true;
}

function readProfile(file) {
  const stat = checkedStat(file);
  if (stat.size > 65536) throw new Error('Profile exceeds 64 KiB');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('Profile changed during access');
    const parsed = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        ['url', 'apiKey', 'cookie'].some(key => parsed[key] !== undefined && typeof parsed[key] !== 'string')) {
      throw new Error('Invalid profile structure');
    }
    return parsed;
  } finally { fs.closeSync(fd); }
}

function loadProfile(name, home = os.homedir(), env = process.env) {
  const file = profilePath(name, home);
  let parsed = {};
  if (privateDirectories(file, false)) {
    try { parsed = readProfile(file); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Profile could not be read safely'); }
  }
  return { name, url: parsed.url || env.MC_URL || 'http://127.0.0.1:3000',
    apiKey: parsed.apiKey || env.MC_API_KEY || '', cookie: parsed.cookie || env.MC_COOKIE || '' };
}

function saveProfile(profile, home = os.homedir(), backup = false) {
  const file = profilePath(profile.name, home);
  privateDirectories(file, true);
  let existing;
  try { checkedStat(file); existing = readProfile(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && backup) {
    const saved = `${file}.before-login-${randomUUID()}`;
    fs.writeFileSync(saved, `${JSON.stringify(existing)}\n`, { flag: 'wx', mode: 0o600 });
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(profile, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.closeSync(fd); } catch { /* Already closed. */ }
    try { fs.unlinkSync(temporary); } catch { /* No temporary file remains. */ }
    throw error;
  }
}

module.exports = { profilePath, loadProfile, saveProfile };
