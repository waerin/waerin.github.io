// ============================================
// Image Lightbox — click a photo to zoom
// Drop into static/js/lightbox.js
// Then include it before </body>, e.g. in your footer partial:
//   <script src="{{ "js/lightbox.js" | relURL }}"></script>
// ============================================

document.addEventListener("DOMContentLoaded", function () {
  // Build the overlay once
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">&times;</button>
    <img src="" alt="">
  `;
  document.body.appendChild(overlay);

  const overlayImg = overlay.querySelector("img");
  const closeBtn = overlay.querySelector(".lightbox-close");

  function openLightbox(src, alt) {
    overlayImg.src = src;
    overlayImg.alt = alt || "";
    overlay.classList.add("active");
    document.body.style.overflow = "hidden"; // stop background scroll
  }

  function closeLightbox() {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  // Only wire up images inside the actual post content,
  // so nav icons, logos, badges etc. don't become clickable.
  const contentImages = document.querySelectorAll(
    "main#main-content img, .post-content img"
  );

  contentImages.forEach(function (img) {
    img.addEventListener("click", function () {
      openLightbox(img.src, img.alt);
    });
  });

  // Close on backdrop click, close button, or Escape key
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeLightbox();
  });
  closeBtn.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeLightbox();
  });
});