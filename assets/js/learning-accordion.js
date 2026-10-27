(function () {
  var root = document.querySelector(".page__content");
  if (!root || root.getAttribute("data-learning-accordion") === "ready") return;

  var headings = Array.prototype.filter.call(root.children, function (el) {
    return el.tagName === "H2";
  });
  if (!headings.length) return;

  headings.forEach(function (heading) {
    var details = document.createElement("details");
    details.className = "learning-section";
    details.open = false;

    var summary = document.createElement("summary");
    summary.className = "learning-section__summary";
    var chevron = document.createElement("span");
    chevron.className = "learning-section__chevron";
    chevron.setAttribute("aria-hidden", "true");
    var body = document.createElement("div");
    body.className = "learning-section__body";

    var sibling = heading.nextElementSibling;
    while (sibling && sibling.tagName !== "H2") {
      var next = sibling.nextElementSibling;
      body.appendChild(sibling);
      sibling = next;
    }

    heading.insertBefore(chevron, heading.firstChild);
    heading.parentNode.insertBefore(details, heading);
    summary.appendChild(heading);
    details.appendChild(summary);
    details.appendChild(body);
  });

  root.setAttribute("data-learning-accordion", "ready");

  function openMatchingSection() {
    if (!window.location.hash) return;
    var id;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch (error) {
      return;
    }
    var target = document.getElementById(id);
    if (!target) return;
    var details = target.closest("details");
    if (details) details.open = true;
  }

  openMatchingSection();
  window.addEventListener("hashchange", openMatchingSection);
})();
