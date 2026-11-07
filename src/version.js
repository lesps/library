// The running version and its release notes, both bundled at build time.
import { version } from '../package.json';
import changelog from '../CHANGELOG.md?raw';

export const VERSION = version;
export const CHANGELOG = changelog;
