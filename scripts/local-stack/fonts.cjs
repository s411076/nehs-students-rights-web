// Webpack next/font requires an @font-face; local() prevents any font download.
module.exports = {
  'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap':
    '@font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: local("Arial"); }',
};
