/** @type {import('tailwindcss').Config} */
export default {
  // index.html carries classes of its own — `<body class="bg-slate-50 …">` —
  // so it has to be scanned alongside the source, or the page loses its
  // background and base text colour.
  //
  // `.ts` is included as well as `.tsx` because a class string held in a
  // constant or a data file counts: the scan reads files, not JSX. Nothing
  // builds class names by interpolation anywhere in this app (there is no
  // `bg-${colour}-500`), so every class a component can render appears here
  // as a literal.
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Entrance animations for the error banner and the Settings panel (#160).
      // Their markup asked for the tailwindcss-animate plugin, which was never
      // installed, so both appeared instantly. Two keyframes here do the same
      // job without a dependency; motion-reduce:animate-none at the call
      // sites turns them off for users who ask for reduced motion.
      keyframes: {
        'fade-in-down': {
          from: { opacity: '0', transform: 'translateY(-0.5rem)' },
          to: { opacity: '1', transform: 'none' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-1rem)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        'fade-in-down': 'fade-in-down 300ms ease-out',
        'slide-in-left': 'slide-in-left 200ms ease-out',
      },
    },
  },
  plugins: [],
};
