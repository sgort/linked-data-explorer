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
    extend: {},
  },
  plugins: [],
};
