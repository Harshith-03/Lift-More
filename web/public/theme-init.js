(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('lm.theme') === 'light') theme = 'light';
  } catch (e) {
    /* storage blocked: keep dark */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f6f1' : '#0b0d0a');
})();
