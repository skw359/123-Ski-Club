import React, { useEffect, useMemo, useRef, useState } from "react";
import "./information.css";

export default function Information() {
  
  // Header/Auth state
  
  const [currentUser, setCurrentUser] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [headerMessage, setHeaderMessage] = useState(null); // { text, type }
  const [modalMessage, setModalMessage] = useState(null); // { text, type }

  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");

  const userProfileRef = useRef(null);
  const emailInputRef = useRef(null);

  
  // PDF viewer refs/state
  
  const pdfRootRef = useRef(null);

  const pdfStateRef = useRef({
    pdfjsLib: null,
    observer: null,
    queue: [],
    destroyed: false,
  });

  const PDF_URL = "/public_uploads/canva.pdf";
  const TARGET_WIDTH = useMemo(() => 1000, []);

  
  // Helpers
  
  function isValidUmdEmail(val) {
    if (typeof val !== "string") return false;
    const lower = val.toLowerCase();
    return lower.endsWith("@terpmail.umd.edu") || lower.endsWith("@umd.edu");
  }

  function showHeaderMessage(text, type = "error") {
    setHeaderMessage({ text, type });
  }
  function showModalMessage(text, type = "error") {
    setModalMessage({ text, type });
  }

  useEffect(() => {
    if (!headerMessage) return;
    const t = setTimeout(() => setHeaderMessage(null), 5000);
    return () => clearTimeout(t);
  }, [headerMessage]);

  useEffect(() => {
    if (!modalMessage) return;
    const t = setTimeout(() => setModalMessage(null), 5000);
    return () => clearTimeout(t);
  }, [modalMessage]);

  useEffect(() => {
    const id = "montserrat-font-link";
    if (document.getElementById(id)) return;

    const pre1 = document.createElement("link");
    pre1.rel = "preconnect";
    pre1.href = "https://fonts.googleapis.com";
    document.head.appendChild(pre1);

    const pre2 = document.createElement("link");
    pre2.rel = "preconnect";
    pre2.href = "https://fonts.gstatic.com";
    pre2.crossOrigin = "anonymous";
    document.head.appendChild(pre2);

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  
  // Modal open/close
  
  function openModal() {
    document.body.classList.add("modal-open");
    setModalOpen(true);
    setTimeout(() => emailInputRef.current?.focus(), 250);
  }

  function closeModal() {
    document.body.classList.remove("modal-open");
    setModalOpen(false);
    setEmail("");
    setModalMessage(null);
  }

  //n then escape key too
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && modalOpen) closeModal();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  
  // auth calls
  
  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      const data = await response.json();

      if (data?.user) {
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
        setDropdownOpen(false);
      }
    } catch (err) {
      // auth check failed — treat as logged out
    }
  }

  async function requestMagicLink(userEmail) {
    try {
      const response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        showHeaderMessage("Login link sent! Please check your UMD email inbox.", "success");
        closeModal();
      } else if (response.status === 404) {
        showModalMessage("No account found. Please contact an admin to be added.", "error");
      } else {
        showModalMessage(result?.error || "Failed to send login link.", "error");
      }
    } catch {
      showModalMessage("Network error. Please try again.", "error");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      await checkAuth();
      showHeaderMessage("Logged out successfully.", "success");
    } catch {
      showHeaderMessage("Logout failed. Please try again.", "error");
    }
  }

  // initial auth check
  useEffect(() => {
    checkAuth();
  }, []);

  
  // dropdown behavior (close when clicking outside)
  
  useEffect(() => {
    function onDocClick(e) {
      const root = userProfileRef.current;
      if (!root) return;
      if (!root.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  
  // PDF.js viewer (DOM-based)
  
  function showPdfError(message) {
    const root = pdfRootRef.current;
    if (!root) return;
    root.innerHTML = `<div class="error">${message}</div>`;
  }

  function getAnnotationClass(annotation) {
    const baseClass = "annotation";
    switch (annotation.subtype) {
      case "Link":
        return "linkAnnotation";
      case "Widget":
        return annotation.fieldType === "Btn"
          ? "buttonWidgetAnnotation pushButton"
          : "buttonWidgetAnnotation";
      default:
        return baseClass;
    }
  }

  async function loadPDFJS() {
    //CDN ESM import + workerSrc
    const pdfjsLib = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs";
    return pdfjsLib;
  }

  async function renderAnnotationLayer(page, viewport, container, pdfjsLib) {
    try {
      const annotations = await page.getAnnotations();
      if (!annotations || annotations.length === 0) return;

      const annotationLayer = document.createElement("div");
      annotationLayer.className = "annotationLayer";

      for (const annotation of annotations) {
        const element = document.createElement("section");
        element.className = getAnnotationClass(annotation);

        const rect = annotation.rect;
        const [x1, y1, x2, y2] = pdfjsLib.Util.normalizeRect([
          rect[0],
          viewport.viewBox[3] - rect[1],
          rect[2],
          viewport.viewBox[3] - rect[3],
        ]);

        element.style.left = `${x1}px`;
        element.style.top = `${y1}px`;
        element.style.width = `${x2 - x1}px`;
        element.style.height = `${y2 - y1}px`;

        if (annotation.subtype === "Link" || annotation.subtype === "Widget") {
          const link = document.createElement("a");

          if (annotation.url) {
            link.href = annotation.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            const tooltip = document.createElement("div");
            tooltip.className = "link-tooltip";
            tooltip.textContent = annotation.url;
            element.appendChild(tooltip);
          } else if (annotation.dest) {
            link.href = "#";
            link.onclick = (e) => {
              e.preventDefault();
            };
          } else if (annotation.actions && annotation.actions.Action) {
            link.href = "#";
            link.onclick = (e) => {
              e.preventDefault();
            };
          }

          element.appendChild(link);
        }

        annotationLayer.appendChild(element);
      }

      container.appendChild(annotationLayer);
    } catch (error) {
      // annotation rendering failed — non-critical, skip silently
    }
  }

  async function renderTextLayer(page, viewport, container) {
    try {
      const textContent = await page.getTextContent();
      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";

      for (const item of textContent.items) {
        if (item.str) {
          const span = document.createElement("span");
          span.textContent = item.str;
          span.style.left = `${item.transform[4]}px`;
          span.style.top = `${item.transform[5]}px`;
          span.style.fontSize = `${Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1])}px`;
          span.style.fontFamily = item.fontName;
          textLayer.appendChild(span);
        }
      }

      container.appendChild(textLayer);
    } catch (error) {
      // text layer rendering failed — non-critical, skip silently
    }
  }

  async function renderPage(pdf, pageNum, pdfjsLib) {
    const page = await pdf.getPage(pageNum);

    const vp = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / vp.width;
    const scaled = page.getViewport({ scale });

    const container = document.createElement("div");
    container.className = "pdf-page-container";
    container.style.width = `${Math.floor(scaled.width)}px`;
    container.style.height = `${Math.floor(scaled.height)}px`;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page";
    canvas.width = Math.floor(scaled.width);
    canvas.height = Math.floor(scaled.height);

    const ctx = canvas.getContext("2d", { alpha: false });
    await page.render({ canvasContext: ctx, viewport: scaled }).promise;

    container.appendChild(canvas);
    await renderAnnotationLayer(page, scaled, container, pdfjsLib);
    await renderTextLayer(page, scaled, container);

    return container;
  }

  function setupObserver() {
    const st = pdfStateRef.current;
    st.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = st.queue.findIndex((q) => q.el === entry.target);
            if (i >= 0) {
              const { run, el } = st.queue.splice(i, 1)[0];
              st.observer?.unobserve(el);
              run();
            }
          }
        }
      },
      { root: null, rootMargin: "800px 0px", threshold: 0.01 }
    );
  }

  function scheduleRender(pdf, pageNum, placeholder) {
    const st = pdfStateRef.current;

    const task = async () => {
      try {
        if (st.destroyed) return;
        const pageContainer = await renderPage(pdf, pageNum, st.pdfjsLib);
        placeholder.replaceWith(pageContainer);
      } catch (e) {
        placeholder.innerHTML = `<div class="error">Failed to render page ${pageNum}</div>`;
      }
    };

    if (st.observer) {
      st.observer.observe(placeholder);
      st.queue.push({ el: placeholder, run: task });
    } else {
      task();
    }
  }

  async function bootPdf() {
  const st = pdfStateRef.current;

  try {
    const root = pdfRootRef.current;
    if (!root) return;

    st.pdfjsLib = await loadPDFJS();
    setupObserver();

    const res = await fetch(PDF_URL, { credentials: "include" });

    if (!res.ok) {
      throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer();

    // Quick signature check: PDFs start with "%PDF-"
    const head = new Uint8Array(buf.slice(0, 8));
    const headText = Array.from(head).map((b) => String.fromCharCode(b)).join("");
    const isPdfSig = headText.startsWith("%PDF-");

    if (!isPdfSig) {
      const sample = new TextDecoder("utf-8").decode(buf.slice(0, 200)).trim();
      throw new Error(
        `URL did not return a PDF. content-type="${contentType}", first bytes="${headText}". ` +
          `This might be a (SPA fallback/redirect) instead of the file.`
      );
    }

    // Load via data: instead of url to avoid CORS/content-type issues, since we already have the data and verified it's a PDF
    const loadingTask = st.pdfjsLib.getDocument({
      data: buf,
    });

    const pdf = await loadingTask.promise;

    root.innerHTML = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const ph = document.createElement("div");
      ph.style.width = "100%";
      ph.style.height = "1200px";
      ph.style.background = "#fff";
      ph.style.margin = "0";
      ph.style.display = "flex";
      ph.style.alignItems = "center";
      ph.style.justifyContent = "center";
      ph.style.color = "#666";
      ph.textContent = `Loading page ${i}...`;
      root.appendChild(ph);

      scheduleRender(pdf, i, ph);
    }
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("fetch failed") || msg.includes("PDF fetch failed")) {
      showPdfError(`Could not fetch PDF from "${PDF_URL}". ${msg}`);
      return;
    }

    if (msg.includes("did not return a PDF")) {
      showPdfError(
        `Your server isn't returning a real PDF at "${PDF_URL}". ` +
          `It's likely serving HTML (SPA fallback / redirect / 404 page) instead. Check console for sample.`
      );
      return;
    }

    showPdfError(`Error loading document: ${msg || "Unknown error"}`);
  }
}


  useEffect(() => {
    // initial “Loading document...” already in DOM, then boot
    bootPdf();

    return () => {
      const st = pdfStateRef.current;
      st.destroyed = true;
      try {
        st.observer?.disconnect();
      } catch {}
      st.queue = [];
      st.observer = null;
      st.pdfjsLib = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PDF_URL, TARGET_WIDTH]);

  
  // Derived UI
  
  const displayName = useMemo(() => {
    if (!currentUser) return "";
    const emailPart = typeof currentUser.email === "string" ? currentUser.email.split("@")[0] : "";
    return currentUser.first_name || emailPart || "User";
  }, [currentUser]);

  const isAdmin = currentUser?.role === "admin";

  
  // Render
  
  return (
    <>
      <header>
        <div className="container header-container">
          <a href="index.html" style={{ textDecoration: "none" }}>
            <div className="logo">
              <img src="assets/umdM.png" alt="UMD Ski Club Logo" />
              <h1>123 Ski Club</h1>
            </div>
          </a>

          <nav>
            <ul>
              <li>
                <a href="aboutus.html">About Us</a>
              </li>
              <li>
                <a href="faqs.html">FAQs</a>
              </li>
              <li>
                <a href="information.html" className="active">
                  Information
                </a>
              </li>
            </ul>
          </nav>

          <div className="user-actions">
            <div id="userInfo" className="user-info">
              {currentUser ? "" : "Not signed in"}
            </div>

            {!currentUser && (
              <button id="loginBtn" className="btn" onClick={openModal}>
                Login with UMD
              </button>
            )}

            {currentUser && (
              <div
                className={`user-profile ${!currentUser ? "hidden" : ""}`}
                id="userProfile"
                ref={userProfileRef}
                onClick={() => setDropdownOpen((v) => !v)}
              >
                <img
                  src="https://imgs.search.brave.com/4xfFa4ySbM-DxrMYeYbk3psFZSpUIOo72IHxyomrAiY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9jZG4u/dmVjdG9yc3RvY2su/Y29tL2kvNTAwcC80/MS84OC9hdmF0YXIt/ZGVmYXVsdC11c2Vy/LXByb2ZpbGUtZmxh/dC1pY29uLXNvY2lh/bC12ZWN0b3ItNTcy/MzQxODguanBn"
                  alt="User Profile"
                />
                <div>
                  <div className="user-name" id="userName">
                    {displayName}
                  </div>
                  <div className="user-role">Member</div>
                </div>

                <div className={`dropdown ${dropdownOpen ? "active" : ""}`} id="userDropdown">
                  <a
                    href="https://123iliketoski.com/admin"
                    id="adminLink"
                    className={`${isAdmin ? "" : "hidden"}`}
                    onClick={(e) => {
                      // allow navigation; just close dropdown
                      setDropdownOpen(false);
                    }}
                  >
                    Admin
                  </a>
                  <a
                    href="#"
                    id="logoutLink"
                    onClick={(e) => {
                      e.preventDefault();
                      setDropdownOpen(false);
                      logout();
                    }}
                  >
                    Logout
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div id="messages" className="container">
          {headerMessage && (
            <div className={`message ${headerMessage.type}`}>{headerMessage.text}</div>
          )}
        </div>
      </header>

      {/* Page content: Seamless PDF viewer */}
      <main>
        <div id="pdfRoot" ref={pdfRootRef} aria-label="Document">
          <div className="loading">Loading document...</div>
        </div>
      </main>

      {/* Login Modal */}
      <div
        className={`modal-overlay ${modalOpen ? "active" : ""}`}
        id="loginModal"
        onClick={(e) => {
          // overlay click closes
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="modal">
          <button className="modal-close" id="modalClose" onClick={closeModal}>
            &times;
          </button>

          <h2 className="modal-title">Login to Continue</h2>

          <div id="modalMessages">
            {modalMessage && (
              <div className={`message ${modalMessage.type}`}>{modalMessage.text}</div>
            )}
          </div>

          <form
            className="login-form"
            id="loginForm"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = email.trim();

              if (!trimmed) return showModalMessage("Please enter your email address.", "error");
              if (!isValidUmdEmail(trimmed))
                return showModalMessage(
                  "Please use your @terpmail.umd.edu or @umd.edu email address.",
                  "error"
                );

              requestMagicLink(trimmed);
            }}
          >
            <div className="form-group">
              <label htmlFor="emailInput">Email (UMD)</label>
              <input
                ref={emailInputRef}
                type="email"
                id="emailInput"
                placeholder="student@terpmail.umd.edu"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" className="btn">
              Send Login Link
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
