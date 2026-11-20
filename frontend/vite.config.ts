import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 빌드 결과는 Flask가 서빙하는 static/app/에 넣고 git에 커밋한다 (PythonAnywhere는 git pull만으로 배포).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/static/app/",
  build: {
    outDir: "../static/app",
    emptyOutDir: true,
  },
  server: {
    // 개발 중에는 Flask(5050)로 API를 넘긴다: python -c "from flask_app import app; app.run(port=5050)"
    proxy: { "/api": "http://127.0.0.1:5050" },
  },
});
