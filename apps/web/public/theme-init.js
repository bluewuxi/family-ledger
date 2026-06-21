(() => {
  try {
    const theme = window.localStorage.getItem("family-ledger.uiTheme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#180F0B" : "#5A321C");
    }
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
