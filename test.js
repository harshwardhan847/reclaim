import { readFileSync } from 'fs';
const content = readFileSync('src-tauri/src/main.rs', 'utf8');
console.log(content.match(/#\[serde\(rename_all = "camelCase"\)\]/g));
