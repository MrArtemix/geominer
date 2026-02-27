import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Replace exact strings
    replacements = {
        'emerald': 'gold',
        'Emerald': 'Gold',
        '#10b981': '#fbbf24',
        '#34d399': '#fcd34d',
        '#059669': '#d97706',
        '#22c55e': '#fbbf24',
        '#15803d': '#b45309',
        '16, 185, 129': '251, 191, 36',
        '16,185,129': '251,191,36',
        '34,197,94': '251,191,36',
        '34, 197, 94': '251, 191, 36'
    }

    for k, v in replacements.items():
        content = content.replace(k, v)

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.css')):
            process_file(os.path.join(root, file))

# Also run on tailwind.config.ts if it exists at root
if os.path.exists('tailwind.config.ts'):
    process_file('tailwind.config.ts')

print("Done")
