/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                'bg-primary': '#0B0F0E',
                'bg-surface': '#111917',
                'bg-elevated': '#1A2420',
                'accent-primary': '#2EFF7B',
                'accent-secondary': '#1ED760',
                'text-primary': '#E6F1EC',
                'text-secondary': '#8FAEA2',
                'text-muted': '#5A7268',
                'border-color': '#1F2D28',
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
                mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
}
