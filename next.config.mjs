/** @type {import('next').NextConfig} */
const nextConfig = {
  // チャート画像は base64 で送るため、ボディサイズの上限を引き上げる
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
