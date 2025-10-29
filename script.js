const video = document.getElementById("heroVideo");
video.addEventListener("ended", () => {
  document.querySelector(".cta").scrollIntoView({ behavior: "smooth" });
});
