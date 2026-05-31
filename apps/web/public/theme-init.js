(() => {
  try {
    const theme = window.localStorage.getItem("family-ledger.uiTheme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#07111F" : "#08264A");
    }
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
