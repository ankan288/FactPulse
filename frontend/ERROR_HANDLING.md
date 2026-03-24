# Frontend Error Handling & Recovery

## Overview

The frontend implements a **multi-layer error handling strategy** to ensure users always get meaningful feedback and never see system crashes.

```
Layer 1: React Error Boundary
  └─ Catches component rendering errors

Layer 2: API Error Mapping
  └─ Translates HTTP errors to user-friendly messages

Layer 3: Error Pages
  └─ 404 and 500 error pages with recovery options

Layer 4: Error Display Component
  └─ Reusable toast/banner for non-critical errors

Layer 5: Try-Catch Blocks
  └─ Local error handling in components
```

---

## Layer 1: React Error Boundary

### What It Catches

- Component rendering errors
- Lifecycle method errors
- Constructor errors
- Event handler errors (if thrown)

### What It Doesn't Catch

- Async errors (use try-catch in async functions)
- Event handlers (unless error is thrown synchronously)
- Server-side rendering errors

### Usage

**File**: `frontend/components/ErrorBoundary.tsx`

```tsx
import ErrorBoundary from "@/components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
```

### Features

```tsx
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// Automatically logs errors
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  console.error("Error caught by boundary:", error, errorInfo);
  // Could send to error tracking service
}

// Allows user to recover
handleReset = () => {
  this.setState({
    hasError: false,
    error: null,
    errorInfo: null,
  });
};
```

### User Experience

When error occurs:
1. Component renders error dialog
2. Shows "Try Again" button (calls `handleReset()`)
3. Shows "Go Home" button (navigates to `/`)
4. Dev mode shows error details for debugging

---

## Layer 2: API Error Mapping

### File

`frontend/lib/api.ts`

### HTTP Status → User Message

```typescript
const statusMessages: Record<number, string> = {
  400: "Invalid input. Please check your text and try again.",
  401: "Authentication failed. Please sign in again.",
  403: "Access denied. You don't have permission for this action.",
  404: "Resource not found.",
  413: "File too large. Maximum 10MB allowed.",
  429: "Too many requests. Please wait a moment before trying again.",
  500: "Server error. Please try again later.",
  503: "Service temporarily unavailable. Please try again later.",
};
```

### Example

```typescript
async function streamVerify(
  input: VerifyInput,
  onMessage: (msg: VerificationMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      // Map HTTP status to user message
      const message = statusMessages[response.status] || 
                      `Error: ${response.statusText}`;
      throw new Error(message);
    }

    // ... handle success
  } catch (error) {
    if (error instanceof Error) {
      onMessage({
        type: "error",
        message: error.message,
      });
    }
  }
}
```

### Common Error Scenarios

| HTTP | Cause | Message | Action |
|------|-------|---------|--------|
| 400 | Input too short | "Invalid input..." | User enters longer text |
| 413 | File too large | "File too large..." | User uploads smaller file |
| 429 | Rate limited | "Too many requests..." | User waits and retries |
| 503 | Services down | "Service unavailable..." | User retries in few minutes |
| Network | Connection lost | "Connection lost..." | User checks internet |

---

## Layer 3: Error Pages

### 404 Not Found

**File**: `frontend/app/not-found.tsx`

Triggered when:
- User visits non-existent route
- `notFound()` called in page/layout

Features:
- Purple-themed design
- "Back to Home" button
- Smooth entrance animation
- Icon: Warning

```jsx
<Link href="/">
  <button>Back to Home</button>
</Link>
```

### 500 Server Error

**File**: `frontend/app/error.tsx`

Triggered when:
- Server returns 5xx error
- Uncaught error in server component
- Route handler throws

Features:
- Red-themed design
- "Try Again" button (reset)
- "Go Home" button (navigate)
- Dev mode shows error details
- Icon: Error

```jsx
<button onClick={reset}>Try Again</button>
<Link href="/">Go Home</Link>
```

---

## Layer 4: Error Display Component

### File

`frontend/components/ErrorDisplay.tsx`

### Types

```tsx
type ErrorType = "error" | "warning" | "info" | "success";

interface ErrorDisplayProps {
  message: string;
  type?: ErrorType;      // "error" (red/red), "warning" (yellow), "info" (blue)
  dismissible?: boolean; // Show X button to close
  onDismiss?: () => void;
  autoClose?: number;    // Close after N milliseconds
}
```

### Usage

```tsx
import ErrorDisplay from "@/components/ErrorDisplay";

export default function Component() {
  const [error, setError] = useState<string>("");

  return (
    <>
      {error && (
        <ErrorDisplay
          message={error}
          type="error"
          dismissible
          onDismiss={() => setError("")}
          autoClose={5000}  // Close after 5 seconds
        />
      )}
      <YourComponent />
    </>
  );
}
```

### Styling

```tsx
type: "error"   → { bg: red, border: red, text: red }
type: "warning" → { bg: yellow, border: yellow, text: yellow }
type: "info"    → { bg: blue, border: blue, text: blue }
type: "success" → { bg: green, border: green, text: green }
```

---

## Layer 5: Component-Level Try-Catch

### Async Function Errors

```tsx
async function handleVerify() {
  try {
    const response = await streamVerify(input, (msg) => {
      // Handle message
    });
  } catch (error) {
    const message = error instanceof Error 
      ? error.message 
      : "Unknown error occurred";
    
    setErrorMessage(message);
    setShowError(true);
  }
}
```

### Event Handler Errors

```tsx
function handleClick() {
  try {
    // Risky operation
    doSomething();
  } catch (error) {
    console.error("Click handler error:", error);
    // Show error to user
  }
}
```

### Render Errors (Within Component)

```tsx
if (!data) {
  return <ErrorDisplay 
    message="Failed to load data" 
    type="error" 
  />;
}

if (data.length === 0) {
  return <ErrorDisplay 
    message="No results found" 
    type="info" 
  />;
}

return <YourComponent />;
```

---

## Error Recovery Patterns

### Pattern 1: Retry

```tsx
const [retryCount, setRetryCount] = useState(0);

async function handleWithRetry() {
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await risky_operation();
      return; // Success
    } catch (error) {
      setRetryCount(i + 1);
      if (i === maxRetries - 1) {
        setError("Operation failed after 3 attempts");
        throw error;
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Backoff
    }
  }
}
```

### Pattern 2: Fallback

```tsx
async function getResults() {
  try {
    return await primarySource();
  } catch (error) {
    console.warn("Primary failed, trying fallback:", error);
    try {
      return await fallbackSource();
    } catch (fallbackError) {
      console.error("Both sources failed:", fallbackError);
      return { partial: true, message: "Limited results available" };
    }
  }
}
```

### Pattern 3: User Choice

```tsx
if (error) {
  return (
    <ErrorDialog>
      <p>Verification failed. What would you like to do?</p>
      <button onClick={handleRetry}>Try Again</button>
      <button onClick={handleSkip}>Skip This Claim</button>
      <button onClick={handleViewPartial}>View Partial Results</button>
    </ErrorDialog>
  );
}
```

---

## Logging & Debugging

### Console Messages

Production:
```
✗ Error: Verification failed: Search API timeout
```

Development:
```
✗ Error: Verification failed: Search API timeout
  at streamVerify (lib/api.ts:42:15)
  at handleVerify (components/InputPanel.tsx:89:20)
  Stack trace: ...
```

### Error Tracking (Future)

Could integrate with Sentry/LogRocket:

```typescript
import * as Sentry from "@sentry/nextjs";

catch (error) {
  Sentry.captureException(error, {
    tags: {
      component: "Dashboard",
      action: "verify",
    },
  });
}
```

---

## Best Practices

### DO

✅ Show user-friendly error messages  
✅ Provide recovery options (retry, skip, home)  
✅ Log detailed errors for debugging  
✅ Gracefully degrade (show partial results)  
✅ Timeout long-running operations  
✅ Show error boundaries around risky components  
✅ Test error scenarios  

### DON'T

❌ Show technical error messages ("ECONNREFUSED")  
❌ Crash silently without feedback  
❌ Require page reload to recover  
❌ Lose user's input on error  
❌ Show errors that are transient (auto-retry first)  
❌ Expose sensitive info in error messages  
❌ Forget to test error paths  

---

## Testing Error Handling

### Simulate Network Error

```tsx
// In browser DevTools Console:
window.fetch = () => {
  throw new Error("Network error");
};

// Try to verify → Should show error dialog
```

### Simulate Component Error

```tsx
// In component:
if (testErrorBoundary) {
  throw new Error("Test error boundary");
}

// Set testErrorBoundary = true → Should catch in ErrorBoundary
```

### Simulate API Error

```python
# In main.py:
@router.post("/api/verify")
async def verify(...):
    # Force error for testing
    raise HTTPException(status_code=500, detail="Test error")
```

---

## User Experience Flow

### Scenario 1: Network Offline
```
User clicks "Verify"
  ↓
API call fails (network error)
  ↓
Error caught in streamVerify()
  ↓
Error message: "Connection lost. Please check your internet."
  ↓
User fixes internet
  ↓
User clicks "Try Again"
  ↓
Verification continues
```

### Scenario 2: Server Down
```
User verifies claim
  ↓
Server returns 503
  ↓
streamVerify() catches error
  ↓
Error message: "Service temporarily unavailable. Please try again later."
  ↓
User waits or tries later
  ↓
Server is back up, retry succeeds
```

### Scenario 3: Component Crashes
```
Dashboard component rendering
  ↓
Error in claim card rendering logic
  ↓
ErrorBoundary catches error
  ↓
Shows error dialog: "Something went wrong"
  ↓
User clicks "Try Again"
  ↓
Component resets and re-renders
```

---

## Error Checklist

For any new feature, ensure:

- [ ] Wrapped in try-catch (if async)
- [ ] User-friendly error messages (no tech stack traces)
- [ ] Recovery option (retry, skip, home)
- [ ] Logged for debugging (console in dev)
- [ ] Tested error scenario
- [ ] Graceful degradation (show what works)
- [ ] No data loss on error
- [ ] No infinite loops / recursive errors
- [ ] Timeouts for long operations
- [ ] Clear error messaging (what failed + why)

