import os
import re

components = [
    'DuplicateView.tsx',
    'SmartCleanView.tsx',
    'AiCacheView.tsx',
    'DevCleanupView.tsx',
    'FileListView.tsx',
    'SystemInfoView.tsx',
    'TreemapViewer.tsx',
    'FileAnalyticsView.tsx'
]

for comp in components:
    filepath = f"src/components/{comp}"
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Already memoized?
    if 'export const ' + comp.replace('.tsx', '') + ' = React.memo' in content:
        continue
        
    # Ensure React is imported
    if 'import React' not in content and 'import * as React' not in content:
        content = "import React from 'react';\n" + content
        
    # Replace `export function Name(` with `export const Name = React.memo(function Name(`
    # and add `);` at the very end of the component (which might be tricky)
    # Actually, it's easier to just do:
    # content = content.replace('export function Name', 'export const Name = React.memo(function Name')
    # BUT we have to close the bracket!
    
    # Better approach: find `export function Name` -> `function Name`
    # and append `export const Name = React.memo(Name);` at the end of the file.
    
    name = comp.replace('.tsx', '')
    
    if f"export function {name}" in content:
        content = content.replace(f"export function {name}", f"function {name}")
        content += f"\nexport const {name}Memo = React.memo({name});\n"
        content += f"export {{ {name}Memo as {name} }};\n"
        
        with open(filepath, 'w') as f:
            f.write(content)
            
