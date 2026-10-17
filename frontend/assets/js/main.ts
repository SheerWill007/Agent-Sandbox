// ===========================
// Type Definitions
// ===========================
interface CodeBlockData {
  sdk: string;
  rest: string;
  mcp: string;
}

// ===========================
// Mobile Navigation Toggle
// ===========================
function initMobileNav(): void {
  const navToggle = document.querySelector('.nav-toggle') as HTMLButtonElement | null;
  const navLinks = document.querySelector('.nav-links') as HTMLElement | null;

  if (!navToggle || !navLinks) return;

  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });

  // Close nav when clicking a link
  const links = navLinks.querySelectorAll('a');
  links.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });

  // Close nav when clicking outside
  document.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    if (!navToggle.contains(target) && !navLinks.contains(target)) {
      navLinks.classList.remove('active');
    }
  });
}

// ===========================
// FAQ Accordion
// ===========================
function initFAQ(): void {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question') as HTMLButtonElement | null;
    
    if (!question) return;

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      // Close all other items
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('active');
        }
      });

      // Toggle current item
      item.classList.toggle('active', !isActive);
    });
  });
}

// ===========================
// Copy to Clipboard for Code Blocks
// ===========================
function initCopyButtons(): void {
  const codeData: CodeBlockData = {
    sdk: `import { Sandbox } from "@agent-sandbox/sdk";

const sandbox = new Sandbox({ apiKey });
const session = sandbox.create({ 
  template: "python" 
});

const result = await session.runCode(
  "print('Hello VM!')"
);
await session.destroy();`,
    
    rest: `curl -X POST \\
  http://localhost:3000/exec/my-session/execute \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template": "node",
    "command": "node",
    "args": ["--version"]
  }'`,
    
    mcp: `{
  "mcpServers": {
    "agent-sandbox": {
      "command": "node",
      "args": [
        "dist/mcp/stdio.js"
      ]
    }
  }
}`
  };

  const copyButtons = document.querySelectorAll('.copy-btn') as NodeListOf<HTMLButtonElement>;

  copyButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const dataKey = button.getAttribute('data-copy') as keyof CodeBlockData;
      
      if (!dataKey || !codeData[dataKey]) {
        // For other code blocks, get text from the next sibling pre element
        const codeBlock = button.nextElementSibling as HTMLPreElement | null;
        if (!codeBlock) return;
        
        const code = codeBlock.textContent || '';
        await copyToClipboard(code, button);
        return;
      }

      await copyToClipboard(codeData[dataKey], button);
    });
  });
}

async function copyToClipboard(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    button.textContent = 'Failed';
    
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  }
}

// ===========================
// Scroll Animations with Intersection Observer
// ===========================
function initScrollAnimations(): void {
  const animatedElements = document.querySelectorAll(
    '.feature-card, .use-case-card, .download-card, .step, .interface-card'
  );

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('scroll-animate', 'visible');
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      }
    );

    animatedElements.forEach(el => {
      el.classList.add('scroll-animate');
      observer.observe(el);
    });
  } else {
    // Fallback: add visible class immediately
    animatedElements.forEach(el => {
      el.classList.add('visible');
    });
  }
}

// ===========================
// Smooth Scroll for Anchor Links
// ===========================
function initSmoothScroll(): void {
  const links = document.querySelectorAll('a[href^="#"]');

  links.forEach(link => {
    link.addEventListener('click', (e: Event) => {
      e.preventDefault();
      
      const href = (link as HTMLAnchorElement).getAttribute('href');
      if (!href || href === '#') return;

      const target = document.querySelector(href);
      if (!target) return;

      const navHeight = document.querySelector('.navbar')?.clientHeight || 0;
      const targetPosition = (target as HTMLElement).offsetTop - navHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    });
  });
}

// ===========================
// Navbar Background on Scroll
// ===========================
function initNavbarScroll(): void {
  const navbar = document.querySelector('.navbar') as HTMLElement | null;
  if (!navbar) return;

  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    // Add shadow when scrolled
    if (currentScroll > 50) {
      navbar.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    } else {
      navbar.style.boxShadow = 'none';
    }

    lastScroll = currentScroll;
  });
}

// ===========================
// Initialize All Features
// ===========================
function init(): void {
  // Wait for DOM to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initMobileNav();
      initFAQ();
      initCopyButtons();
      initScrollAnimations();
      initSmoothScroll();
      initNavbarScroll();
    });
  } else {
    // DOM is already loaded
    initMobileNav();
    initFAQ();
    initCopyButtons();
    initScrollAnimations();
    initSmoothScroll();
    initNavbarScroll();
  }
}

// Start the application
init();

// Export for potential use in modules
export {
  initMobileNav,
  initFAQ,
  initCopyButtons,
  initScrollAnimations,
  initSmoothScroll,
  initNavbarScroll
};
