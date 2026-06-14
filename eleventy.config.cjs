const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { assetUrl: assetUrlFn } = require("@udstillerguide/11ty-media/lib/asset-url");

module.exports = function (eleventyConfig) {
  // immediate:true så vores assetUrl-override er final (11ty 3.x deferrer ellers plugins).
  eleventyConfig.addPlugin(require("@udstillerguide/11ty-media"), { immediate: true });

  // Statiske marketing-assets.
  eleventyConfig.addPassthroughCopy("src/assets");
  // PWA'en kopieres byte-for-byte til _site/app/.
  eleventyConfig.addPassthroughCopy({ "src/app": "app" });

  eleventyConfig.addWatchTarget("src/assets/css/");
  eleventyConfig.addWatchTarget("src/assets/js/");

  // assetUrl: MEDIA_URL-prefix (no-op når MEDIA_URL er tom). Per-fil cache-bust via assetVersion.
  const mediaUrl = process.env.MEDIA_URL || "";
  eleventyConfig.addFilter("assetUrl", (assetPath) => assetUrlFn(assetPath, mediaUrl, null));

  const versionCache = new Map();
  eleventyConfig.addFilter("assetVersion", (srcPath) => {
    if (versionCache.has(srcPath)) return versionCache.get(srcPath);
    try {
      const filePath = path.join(__dirname, "src", srcPath.replace(/^\//, ""));
      const hash = crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex").slice(0, 8);
      versionCache.set(srcPath, hash);
      return hash;
    } catch (e) {
      return "0";
    }
  });

  // kr-formatering: 12.34 -> "12,34". Bruges i besparelses-tal.
  eleventyConfig.addFilter("kr", (n) => Number(n).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  eleventyConfig.addFilter("kr0", (n) => Number(n).toLocaleString("da-DK", { maximumFractionDigits: 0 }));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
