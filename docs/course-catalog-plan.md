# Plan: Catalog course đa ngôn ngữ

Trạng thái (2026-10-21): **đang triển khai**. Đã có: hạ tầng chấm đa ngôn ngữ (§7), course mẫu
`python-rag-from-scratch` (§6) và JS-1 `js-modern-foundations` (viết đầy đủ). 27 course còn lại đã vào
catalog dưới dạng **draft chỉ có đề cương** (`content/courses/<id>/course.json`, `modules: []` + `outline`),
kèm role, skill, goal và prerequisite (§5.1). Tất cả chỉ ở local.

Dựa trên: khuôn lesson của `nodejs-high-performance` và `javascript-async-architecture`
([content/README.md](../content/README.md)), EXP và Level ([experience-leveling-design.md](experience-leveling-design.md)),
commerce và premium ([premium-onboarding-design.md](premium-onboarding-design.md)), sandbox ([sandbox.md](sandbox.md)).

## 1. Phạm vi

| Ngôn ngữ | Toolchain trong sandbox | Chế độ chấm |
|---|---|---|
| JavaScript | Node 24 | `function` (harness, chạy được cả trong trình duyệt) |
| Python | 3.14 | `stdio` |
| C | gcc 15.2, `-std=c23` | `stdio` |
| C++ | g++ 15.2, `-std=c++23` | `stdio` |
| Java | OpenJDK 21 (`public class Main`) | `stdio` |
| Go | 1.26 | `stdio` |
| Rust | 1.93, edition 2024 | `stdio` |

Tổng: **20 course mới** cộng 2 course JavaScript đang có. Mỗi ngôn ngữ có ít nhất 1 course miễn phí,
và có đủ các mức beginner → expert khi gom theo từng nhóm ngôn ngữ.

## 2. Nguyên tắc thiết kế (giữ nguyên từ các course trước, thêm 3 điểm mới)

1. **Khuôn lesson:** sự cố production → tái hiện → khái niệm → challenge → cách sửa → pitfalls → checklist.
   Mỗi lesson có 1 sơ đồ (`diagrams/*.svg`), thời lượng 15–25 phút.
2. **Mới: 1–2 challenge mỗi lesson** (chỉ áp dụng cho course mới; hai course JS hiện có giữ nguyên).
   Mỗi lesson có ít nhất 1 challenge. Trên toàn course, ≥ 60% lesson có challenge viết code
   (`mini_coding` hoặc `fix_bug`); quiz dùng cho lesson thiên về khái niệm hoặc “dự đoán kết quả”.
3. **Mới: challenge phải chạy được trong sandbox:**
   - chỉ dùng thư viện chuẩn, không mạng, không file ngoài thư mục làm việc;
   - kết quả tất định (không phụ thuộc giờ hệ thống, thứ tự thread, hay số ngẫu nhiên không seed);
   - test chạy dưới 2 s, bộ nhớ 128 MB (tối đa 10 s và 256 MB).

   Framework (FastAPI, Spring Boot, Tokio...) chỉ xuất hiện trong phần giảng. Challenge cài phần lõi
   bằng thư viện chuẩn: rate limiter, circuit breaker, parser...
4. **Mới: khuôn `stdio`:**
   - `starter.<ext>` có sẵn phần đọc stdin và in kết quả; người học chỉ viết hàm.
   - Input của test là JSON hoặc chuỗi; output là một dòng JSON hoặc văn bản.
   - Khi chấm, so khớp không phân biệt CRLF và khoảng trắng cuối dòng, JSON so như JSON
     (`lib/challenges/compare.js` `stdoutMatches`).
5. **Điểm và EXP theo bảng hiện có:**
   - Điểm của challenge: quiz **10**, `fix_bug` **20**, `mini_coding` **30**. Mỗi lesson hoàn thành được 10 điểm.
   - EXP: lesson 10; quiz 5/8/12; mini_coding 10/20/35; fix_bug 8/15/25 (easy/medium/hard).
   - Thưởng hoàn thành course (chỉ EXP): beginner 50, intermediate 100, advanced 150, expert 200.
6. **Không đưa đáp án hay test vào Sanity:** đáp án và test nằm trong `challenges.json`, sau đó vào Postgres.

## 3. Mức độ, Level đề xuất và giá

| Mức | Level đề xuất | Lesson | Truy cập | Giá điểm | Giá tiền |
|---|---|---:|---|---:|---:|
| beginner | 1–5 | 8 | **miễn phí** | – | – |
| intermediate | 4–9 | 6–9 | premium | 300 điểm | 149.000 ₫ |
| advanced | 8–14 | 9 | premium | 600 điểm | 249.000 ₫ |
| expert | 13–20 | 9 | premium | 1.000 điểm | 349.000 ₫ |

- Giá nằm trong `commerce.offer` (`price_type` `points` hoặc `money`, VND), course premium có
  `access_model = 'premium'`. Mỗi course premium có **cả hai** offer: người học tự chọn trả tiền hay đổi điểm.
  Seed sinh từ `course.json`: `accessModel`, `offers` (§8).
- Cân đối điểm: một course beginner 8 lesson cho khoảng 300 điểm (80 từ lesson, khoảng 220 từ challenge),
  tức là học xong một course miễn phí thì đủ mở một course intermediate bằng điểm.
  Advanced cần khoảng 2 course, expert khoảng 3 course: điểm thưởng đúng nghĩa “học để mở khóa”.
- Hai course JS hiện có (intermediate) **vẫn miễn phí**: đó là cửa vào của nền tảng.

Ký hiệu challenge trong các bảng bên dưới: **Q** quiz, **C** mini_coding, **F** fix_bug; độ khó **e/m/h**.

## 4. Catalog theo ngôn ngữ

### 4.1 JavaScript (Node 24)

Đã có: *JavaScript: Asynchronous Architecture & Production Patterns* (intermediate, free, 18 lesson),
*Node.js High Performance: Concurrency & Consistency* (intermediate, free, 12 lesson).

**JS-1 `js-modern-foundations`: Modern JavaScript on Node 24: Fundamentals that Ship.** Beginner, free, Programming Fundamentals.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Values, types & equality traps (`==`, `NaN`, `0.1 + 0.2`) | Q(e) + C(e) |
| 1.2 | Arrays & objects: map/filter/reduce, `structuredClone` | C(e) |
| 2.1 | Closures & scope bugs in loops | Q(e) + F(e) |
| 2.2 | ES modules in Node 24: import/export, top-level await | Q(m) |
| 3.1 | Iterator helpers & new Set methods (ES2025) | C(m) |
| 3.2 | Dates and time zones: UTC, `Intl.DateTimeFormat` | Q(m) + C(m) |
| 4.1 | Errors: `cause`, `AggregateError`, error boundaries | F(m) |
| 4.2 | Testing with `node:test` & `assert` | Q(e) + C(m) |

**JS-2 `nodejs-ai-engineering`: AI Engineering with Node.js: LLM Apps, Tool Calling & Streaming.** Advanced, premium, LLM Engineering.
The model is simulated by the harness (a fake stream), so it is deterministic and needs no API key.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Streaming responses: parsing SSE chunks split at any byte | C(m) |
| 1.2 | Token budgets & trimming the context window | Q(m) + C(m) |
| 1.3 | 429s, `retry-after` & idempotent requests | F(m) |
| 2.1 | The tool-calling loop: dispatch, validate args, feed results back | C(h) |
| 2.2 | Validating structured output against a JSON Schema subset | C(h) |
| 2.3 | Prompt injection & tool permission boundaries | Q(h) + F(m) |
| 3.1 | Embeddings & cosine top-k with metadata filters | C(m) |
| 3.2 | Semantic cache with a similarity threshold | Q(m) + C(m) |
| 3.3 | Evals: golden sets, LLM-as-judge pitfalls, regression gates | Q(m) + C(m) |

**JS-3 `nodejs-api-security`: Node.js API Security: OWASP API Top 10 in Practice.** Expert, premium, Cyber Security.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | BOLA: object-level authorization checks | F(m) |
| 1.2 | JWT verification pitfalls: `alg`, `exp`, `aud`, clock skew | Q(h) + C(h) |
| 1.3 | Refresh token rotation & reuse detection | C(h) |
| 2.1 | Mass assignment & allow-lists | F(m) |
| 2.2 | SSRF: URL parsing & allow-listing | Q(h) + C(h) |
| 2.3 | Unrestricted resource consumption: sliding-window limits | C(m) |
| 3.1 | Secrets & log redaction | C(m) |
| 3.2 | Supply chain: lockfiles, provenance, `npm audit` triage | Q(m) |
| 3.3 | Security headers & CORS done right | Q(m) + F(m) |

### 4.2 Python 3.14

**PY-1 `python-foundations-automation`: Python 3.14 Foundations: Automation & Data Scripts.** Beginner, free, Python Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Values, strings & f-strings | Q(e) + C(e) |
| 1.2 | Lists, dicts, sets & comprehensions | C(e) |
| 2.1 | Functions & the mutable default argument bug | Q(e) + F(e) |
| 2.2 | `match`/`case` for parsing commands | C(m) |
| 3.1 | `pathlib`, CSV & JSON | C(m) |
| 3.2 | Cleaning messy data: normalize, dedupe, group | Q(m) + C(m) |
| 4.1 | Exceptions & exception groups (`except*`) | F(m) |
| 4.2 | `dataclasses`, type hints & a log-report CLI | Q(e) + C(m) |

**PY-2 `python-rag-from-scratch`: Python for AI Engineering: Build a RAG Pipeline from Scratch.** Intermediate, premium, AI Engineering.
**The sample course, written in full (§6).**

**PY-3 `python-asyncio-services`: Async Python: asyncio, TaskGroup & High-Throughput Services.** Advanced, premium, Backend Development.
Challenges print the order of events on a simulated clock, not the real time.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Coroutines vs blocking calls in the event loop | Q(m) + F(m) |
| 1.2 | `TaskGroup` & structured concurrency | C(m) |
| 1.3 | Timeouts & cancellation (`asyncio.timeout`) | Q(h) + C(m) |
| 2.1 | Semaphore-limited fan-out | C(m) |
| 2.2 | Queues & backpressure: producer/consumer | C(h) |
| 2.3 | Rate limiting with a token bucket | Q(m) + C(m) |
| 3.1 | Retries with backoff & jitter | F(m) |
| 3.2 | Sync code in async apps: `to_thread`, executors, free-threaded 3.14 | Q(h) |
| 3.3 | Graceful shutdown & signal handling | Q(m) + C(h) |

### 4.3 C (gcc 15.2, C23)

**C-1 `c-foundations-memory`: C Foundations: Memory, Pointers & Strings.** Beginner, free, Programming Fundamentals.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Types, sizes & integer overflow | Q(e) + C(e) |
| 1.2 | Arrays & loops: the off-by-one | F(e) |
| 2.1 | Pointers & pointer arithmetic | Q(m) + C(m) |
| 2.2 | Strings: terminators & buffer overflows | F(m) |
| 3.1 | `malloc`/`free`, leaks & use-after-free | Q(m) + F(m) |
| 3.2 | Structs & a growable array | C(m) |
| 4.1 | Reading input safely: `fgets`, `strtol` | C(m) |
| 4.2 | C23 essentials: `bool`, `nullptr`, `constexpr`, `typeof` | Q(e) |

**C-2 `c-systems-programming`: Systems Programming in C: Allocators, Ring Buffers & Parsers.** Advanced, premium, Operating Systems.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | An arena allocator | C(m) |
| 1.2 | Alignment & struct padding | Q(m) + C(m) |
| 1.3 | Hunting undefined behaviour | Q(h) + F(h) |
| 2.1 | Ring buffer for one producer and one consumer | C(m) |
| 2.2 | Hash table with open addressing | C(h) |
| 2.3 | Bit manipulation & flag sets | Q(m) + C(m) |
| 3.1 | Parsing a binary protocol: endianness | C(h) |
| 3.2 | A line parser that survives partial reads | F(m) |
| 3.3 | Defensive C: bounds, integer checks, sanitizers | Q(m) |

### 4.4 C++ (g++ 15.2, C++23)

**CPP-0 `cpp-foundations`: C++ Foundations: From C to Modern C++.** Beginner, free, Programming Fundamentals.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Types, references & `const` | Q(e) + C(e) |
| 1.2 | `std::string` & `std::vector` instead of raw arrays | C(e) |
| 2.1 | Functions, overloading & pass-by-reference bugs | Q(e) + F(e) |
| 2.2 | Classes & constructors | C(m) |
| 3.1 | STL algorithms: sort, find, accumulate | C(m) |
| 3.2 | `std::map` vs `std::unordered_map` | Q(m) + C(m) |
| 4.1 | Iterators & invalidation bugs | Q(m) + F(m) |
| 4.2 | Mini project: a grade book | C(m) |

**CPP-1 `cpp23-modern`: Modern C++23: RAII, Move Semantics, Ranges & `std::expected`.** Intermediate, premium, Object-Oriented Programming.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | RAII & the rule of zero | Q(m) + C(m) |
| 1.2 | `unique_ptr`, `shared_ptr` & reference cycles | Q(m) + F(m) |
| 1.3 | Move semantics & copy elision | Q(h) + C(m) |
| 2.1 | Ranges & views pipelines | C(m) |
| 2.2 | Concepts for readable templates | Q(m) + C(m) |
| 2.3 | Lambdas & dangling captures | F(m) |
| 3.1 | `std::expected` instead of exceptions on hot paths | C(m) |
| 3.2 | `std::format` & `std::print` | Q(e) + C(e) |
| 3.3 | `std::optional`, `std::variant` & `std::visit` | C(h) |

**CPP-2 `cpp-high-performance`: High-Performance C++: Data-Oriented Design & Concurrency.** Expert, premium, Performance Optimization.
Concurrency tests check the final state, never the thread interleaving.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Cache lines: AoS vs SoA | Q(h) + C(m) |
| 1.2 | Small-buffer & flat containers | C(h) |
| 1.3 | Allocation on hot paths & `std::pmr` | Q(h) + C(h) |
| 2.1 | Top-K over a stream with heaps | C(m) |
| 2.2 | The core of an order-book matching engine | C(h) |
| 2.3 | Branch prediction & benchmarking pitfalls | Q(h) |
| 3.1 | `std::jthread` & `stop_token` | C(m) |
| 3.2 | Atomics & memory order | Q(h) + F(h) |
| 3.3 | A lock-free SPSC queue | C(h) |

### 4.5 Java 21

**JAVA-1 `java21-foundations`: Java 21 Foundations: Records, Collections & Streams.** Beginner, free, Java Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Types, strings & text blocks | Q(e) + C(e) |
| 1.2 | Classes, records & `equals`/`hashCode` | F(e) |
| 2.1 | Choosing `List`, `Set` or `Map` | Q(e) + C(m) |
| 2.2 | Streams & collectors | C(m) |
| 3.1 | Sealed interfaces & pattern matching for `switch` | Q(m) + C(m) |
| 3.2 | `Optional` & null safety | F(m) |
| 4.1 | Exceptions & try-with-resources | Q(e) |
| 4.2 | Mini project: an inventory report | C(m) |

**JAVA-2 `java21-virtual-threads`: Java 21 Concurrency: Virtual Threads & Structured Patterns.** Intermediate, premium, Backend Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Platform vs virtual threads: when each wins | Q(m) |
| 1.2 | Fan-out with `newVirtualThreadPerTaskExecutor` | C(m) |
| 1.3 | Pinning & `synchronized` pitfalls | Q(h) + F(m) |
| 2.1 | Race conditions: `AtomicLong` & `LongAdder` | F(m) |
| 2.2 | `ConcurrentHashMap` compute patterns | C(m) |
| 2.3 | `ReentrantLock` & `ReadWriteLock` | Q(m) + C(m) |
| 3.1 | `CompletableFuture`: composition & timeouts | C(h) |
| 3.2 | Bounded queues & backpressure | C(m) |
| 3.3 | Context propagation: `ThreadLocal` vs `ScopedValue` (preview) | Q(m) |

**JAVA-3 `java-resilient-microservices`: Resilient Microservices in Java: Retries, Circuit Breakers & Outbox.** Advanced, premium, Microservices.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Timeouts & retry budgets | Q(m) + C(m) |
| 1.2 | A circuit breaker state machine | C(h) |
| 1.3 | Bulkheads | Q(m) + C(m) |
| 2.1 | Idempotency keys | C(m) |
| 2.2 | Transactional outbox & at-least-once delivery | Q(h) + F(m) |
| 2.3 | Saga orchestration & compensations | C(h) |
| 3.1 | Cache-aside & stampede protection | C(m) |
| 3.2 | Tracing context: parsing W3C `traceparent` | C(m) |
| 3.3 | Mapping the patterns to Spring Boot & Resilience4j | Q(m) |

### 4.6 Go 1.26

**GO-1 `go-foundations`: Go Fundamentals: Types, Errors, Slices & Maps.** Beginner, free, Go Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Variables, types & zero values | Q(e) + C(e) |
| 1.2 | Slices: the `append` aliasing bug | Q(m) + F(m) |
| 2.1 | Maps & structs | C(e) |
| 2.2 | Methods & interfaces | Q(e) + C(m) |
| 3.1 | Errors as values: wrapping & `errors.Is` | F(m) |
| 3.2 | Generics basics | C(m) |
| 4.1 | Packages & `go test` | Q(e) |
| 4.2 | Mini project: a word-frequency CLI | C(m) |

**GO-2 `go-concurrency`: Concurrency in Go: Goroutines, Channels & Context.** Intermediate, premium, Backend Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Goroutines & `WaitGroup` | Q(e) + C(m) |
| 1.2 | Channels: buffered, unbuffered & deadlocks | Q(m) + F(m) |
| 1.3 | `select` & timeouts | C(m) |
| 2.1 | Worker pools | C(m) |
| 2.2 | Pipelines, fan-out & fan-in | C(h) |
| 2.3 | Data races & `sync.Mutex` | Q(m) + F(m) |
| 3.1 | Cancellation with `context` | C(m) |
| 3.2 | Error propagation across goroutines | C(h) |
| 3.3 | Goroutine leaks | Q(m) + F(m) |

**GO-3 `go-cloud-native`: Cloud-Native Go: Building an API Gateway.** Advanced, premium, Microservices.
HTTP challenges call the handler with `httptest.NewRecorder` (no sockets).

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Routing & middleware chains with `net/http` | Q(m) + C(m) |
| 1.2 | Per-client rate limiting (token bucket) | C(m) |
| 1.3 | Request validation & JSON error responses | F(m) |
| 2.1 | Consistent hashing for load balancing | C(h) |
| 2.2 | Health checks & circuit breaking | Q(m) + C(m) |
| 2.3 | TTL cache & single-flight | C(h) |
| 3.1 | Graceful shutdown & Kubernetes probes | Q(m) |
| 3.2 | Structured logging with `log/slog` | Q(e) + C(m) |
| 3.3 | Metrics: histograms & percentiles | C(m) |

### 4.7 Rust 1.93 (edition 2024)

**RS-1 `rust-foundations`: Rust Foundations: Ownership, Borrowing & Error Handling.** Beginner, free, Rust Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Variables, mutability & types | Q(e) + C(e) |
| 1.2 | Ownership & moves | Q(e) + F(e) |
| 2.1 | Borrowing & the first lifetime errors | Q(m) + F(m) |
| 2.2 | Structs, enums & `match` | C(m) |
| 3.1 | `Option`, `Result` & the `?` operator | C(m) |
| 3.2 | `Vec`, `HashMap` & `String` | C(m) |
| 4.1 | Traits basics | Q(e) |
| 4.2 | Mini project: a CSV summary CLI | C(m) |

**RS-2 `rust-practical`: Practical Rust: Traits, Iterators & Robust CLIs.** Intermediate, premium, Rust Development.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Iterator adapters & laziness | C(m) |
| 1.2 | Closures & the `Fn` traits | Q(m) + C(m) |
| 1.3 | Trait objects vs generics | Q(m) |
| 2.1 | Error enums & `From` conversions | C(m) |
| 2.2 | Parsing with `FromStr` & newtypes | C(m) |
| 2.3 | Lifetimes in structs | Q(h) + F(m) |
| 3.1 | `Box`, `Rc` & `RefCell` | Q(m) + F(m) |
| 3.2 | Testing & thinking in invariants | Q(m) |
| 3.3 | Mini project: a log analyzer | C(h) |

**RS-3 `rust-systems-concurrency`: Rust for Systems: Zero-Copy Parsing, Concurrency & Performance.** Expert, premium, Performance Optimization.

| # | Lesson | Challenge |
|---|---|---|
| 1.1 | Zero-copy parsing with slices | C(h) |
| 1.2 | Arenas & index-based graphs | C(h) |
| 1.3 | `Cow` & avoiding allocations | Q(m) + C(m) |
| 2.1 | Threads, `Arc<Mutex<_>>` & channels | C(m) |
| 2.2 | `Send`, `Sync` & the races the compiler prevents | Q(h) |
| 2.3 | Scoped threads & a parallel map by hand | C(h) |
| 3.1 | Unsafe Rust: invariants & soundness | Q(h) + F(h) |
| 3.2 | How async works: `Future` & `poll` without a runtime | Q(h) |
| 3.3 | A bounded MPMC queue | C(h) |

## 5. Tổng hợp

| Ngôn ngữ | Beginner (free) | Intermediate | Advanced | Expert |
|---|---|---|---|---|
| JavaScript | JS-1 | 2 course hiện có (free) | JS-2 | JS-3 |
| Python | PY-1 | **PY-2 (mẫu)** | PY-3 | – |
| C | C-1 | – | C-2 | – |
| C++ | CPP-0 | CPP-1 | – | CPP-2 |
| Java | JAVA-1 | JAVA-2 | JAVA-3 | – |
| Go | GO-1 | GO-2 | GO-3 | – |
| Rust | RS-1 | RS-2 | – | RS-3 |

### 5.1 Phủ theo career role (bổ sung 2026-10-21)

Catalog theo ngôn ngữ ở trên thiếu course cho frontend, mobile, DevOps, data và QA. Thêm 9 course (draft, có đề cương):

| Course | Mức | Ngôn ngữ | Role chính |
|---|---|---|---|
| `web-foundations-html-css-a11y` | beginner (free) | HTML5 | frontend, fullstack, mobile, student |
| `typescript-react-frontend` | intermediate | TypeScript | frontend, fullstack, mobile |
| `react-native-offline-first` | intermediate | TypeScript | mobile, fullstack, frontend |
| `test-automation-foundations` | beginner (free) | JavaScript | QA, frontend, backend, fullstack, student |
| `python-api-testing` | intermediate | Python | QA, backend, DevOps |
| `devops-foundations-ci-containers` | beginner (free) | Python | DevOps, backend, student |
| `sql-data-analysis-foundations` | beginner (free) | SQL (SQLite qua Python `sqlite3`) | data analyst, data engineer, student |
| `python-data-pipelines` | intermediate | Python | data engineer, backend, data analyst |
| `python-ml-from-scratch` | intermediate | Python | ML engineer, data analyst, data engineer |

Mỗi course có `careerRoles`, `skills` (trọng số 1–5), `goals` và `prerequisites` trong `course.json`; seed ghi
vào `catalog.course_career_role`, `course_skill`, `course_learning_goal`, `course_industry`, `course_prerequisite`.
Số course theo role (tính cả draft): backend 25, DevOps 11, student 11, fullstack 9, frontend 6, data engineer 6,
mobile 5, data analyst 4, ML engineer 4, QA 4. Chưa có: Kotlin/Swift (sandbox chưa chạy hai ngôn ngữ này).

### 5.2 Ngôn ngữ mới và cân bằng role (bổ sung 2026-10-22)

Runner `codedev-runner:v3` chạy thêm PHP, TypeScript (`tsc --strict`), Kotlin (kèm kotlinx.coroutines) và C# (.NET 10).
Thêm 14 course (draft, có đề cương) để mỗi role có đủ beginner -> advanced:

| Course | Mức | Ngôn ngữ | Role chính |
|---|---|---|---|
| `php-foundations` | beginner (free) | PHP | student, backend, fullstack |
| `php-modern-apis` | intermediate | PHP | backend, fullstack |
| `kotlin-foundations` | beginner (free) | Kotlin | student, mobile, backend |
| `kotlin-coroutines-flows` | intermediate | Kotlin | mobile, backend |
| `kotlin-mobile-architecture` | advanced | Kotlin | mobile, fullstack |
| `csharp-foundations` | beginner (free) | C# | student, backend, fullstack |
| `csharp-async-services` | intermediate | C# | backend, fullstack |
| `typescript-foundations` | beginner (free) | TypeScript | student, frontend, fullstack, mobile, QA |
| `typescript-type-level` | advanced | TypeScript | frontend, fullstack |
| `typescript-test-design` | intermediate | TypeScript | QA, frontend, fullstack |
| `sql-window-analytics` | intermediate | SQL | data analyst, data engineer, backend |
| `python-ml-evaluation` | advanced | Python | ML engineer, data analyst, data engineer |
| `qa-performance-reliability` | advanced | Python | QA, DevOps, backend |
| `frontend-web-performance` | advanced | JavaScript | frontend, fullstack |

Roadmap: `content/roadmaps.json` có 10 roadmap, mỗi career role một cái (thay 7 roadmap chung chung cũ chưa gắn
course). Mỗi node gắn course thật; course draft không hiện trên trang roadmap cho tới khi publish.

Chủ đề “hot” được ưu tiên: AI/LLM và RAG (JS-2, PY-2), bảo mật API (JS-3), async và concurrency
(PY-3, JAVA-2, GO-2, CPP-2, RS-3), cloud-native và microservices (JAVA-3, GO-3), hệ thống và hiệu
năng (C-2, CPP-2, RS-3). Các course beginner đều dẫn thẳng sang course intermediate cùng ngôn ngữ.

## 6. Course mẫu: `python-rag-from-scratch` (đã viết)

Python for AI Engineering: Build a RAG Pipeline from Scratch. Intermediate, Level đề xuất 4–9.
Premium: 300 điểm hoặc 149.000 ₫. Category AI Engineering. `publishStatus: draft` cho tới khi production có code runner.

| # | Lesson | Challenge | Điểm | EXP |
|---|---|---|---:|---:|
| 1.1 | Chunking documents with overlap | Q(m) `chal_quiz_py_rag_111` + C(m) `chal_coding_py_rag_112` | 10 + 30 | 8 + 20 |
| 1.2 | Near-duplicate detection with shingles & Jaccard | F(m) `chal_fix_py_rag_121` | 20 | 15 |
| 2.1 | Ranking with BM25 | Q(m) `chal_quiz_py_rag_211` + C(h) `chal_coding_py_rag_212` | 10 + 30 | 8 + 35 |
| 2.2 | Hybrid search with Reciprocal Rank Fusion | C(m) `chal_coding_py_rag_221` | 30 | 20 |
| 3.1 | Packing context under a token budget, with citations | C(h) `chal_coding_py_rag_311` + Q(m) `chal_quiz_py_rag_312` | 30 + 10 | 35 + 8 |
| 3.2 | Measuring retrieval: recall@k & MRR | F(m) `chal_fix_py_rag_321` | 20 | 15 |

Tổng: 6 lesson (60 điểm, 60 EXP) + 9 challenge (190 điểm, 164 EXP) + thưởng course 100 EXP
= **250 điểm, 324 EXP**.

## 7. Hạ tầng chấm đa ngôn ngữ (đã triển khai)

- `codedev_sandbox` (compose) giờ build từ `sandbox/vercel/Dockerfile`, target `docker`: cùng toolchain
  và cùng `run-job` với image Vercel Sandbox. `server.mjs` giao mọi ngôn ngữ cho `run-job`
  (slot user `run01..run08`); chạy trên host (test) thì vẫn chỉ JS như cũ.
- App:
  - `codeRunner.executeTests({ language })`.
  - `challenge.service`: chấm `stdio` bằng `stdoutMatches`; `runCodingSamples` cho nút Run
    (Python, C, C++, Java, Go, Rust chạy trên server, không tính lượt).
  - Ngôn ngữ khác JS bắt buộc có code runner (503 nếu thiếu).
- Editor: icon theo ngôn ngữ; Run gọi server cho ngôn ngữ khác JS.
- Content tools: `languages.mjs`, `verify-challenges` chạy non-JS qua sandbox, `upload-storage`
  dùng key `challenges/<language>/<id>/starter.<ext>`, `build-seed` ghi `access_model`,
  `publish_status` (lúc tạo) và `commerce.offer`.
- **Production chưa có code runner** (Vercel, xem [sandbox.md](sandbox.md) “Vercel Sandbox, in progress”).
  Course có challenge ngôn ngữ khác JS phải ở `draft` cho tới khi Phase 1 (app gọi Vercel Sandbox
  qua `@vercel/sandbox`) xong. Image `codedev-runner` cần build lại (cờ C23, C++23, Rust 2024 mới).

## 8. Quy trình viết một course

```bash
npm run services:up                                              # sandbox + MinIO + Redis
node content/tools/build-course.mjs content/courses/<course>     # verify, upload, build lessons, seed
psql "$DATABASE_URL" -f db/seeds/<course>.sql                    # local DB
node content/tools/build-course.mjs content/courses/<course> --push   # Sanity drafts (publish in /studio)
```

`course.json` cho course premium:

```json
{ "level": "intermediate", "accessModel": "premium", "publishStatus": "draft",
  "offers": [{ "priceType": "points", "amount": 300 }, { "priceType": "money", "amount": 149000, "currency": "VND" }] }
```

Challenge `stdio` trong `challenges.json`:

```json
{ "coding": { "language": "python", "filePath": "chunker.py", "executionMode": "stdio",
              "timeLimitMs": 2000, "memoryLimitMb": 128, "scoringMode": "all_or_nothing", "maxAttempts": null },
  "tests": [{ "name": "...", "input": { "text": "..." }, "expected": [["a", "b"]], "hidden": false, "score": 6 }] }
```

## 9. Lộ trình

| Giai đoạn | Việc | Điều kiện xong |
|---|---|---|
| 0 (xong) | Sandbox đa ngôn ngữ ở local, course mẫu PY-2 | Verify, seed và UI chạy ở local |
| 1 | Code runner production (Vercel Sandbox Phase 1), rebuild và push `codedev-runner` | Run/Submit Python chạy trên production |
| 2 | 7 course beginner miễn phí (JS-1, PY-1, C-1, CPP-0, JAVA-1, GO-1, RS-1) | Mỗi ngôn ngữ có cửa vào miễn phí |
| 3 | Intermediate premium (PY-2 publish, CPP-1, JAVA-2, GO-2, RS-2) | Offer điểm và tiền hoạt động, đổi điểm test end-to-end |
| 4 | Advanced/expert (JS-2, JS-3, PY-3, C-2, CPP-2, JAVA-3, GO-3, RS-3) | Theo nhu cầu (lượt đăng ký, khảo sát) |

JS-1 không cần code runner (chạy trong trình duyệt), có thể làm song song với giai đoạn 1.

## 10. Rủi ro

- **Chi phí chạy code:**
  - Ngôn ngữ biên dịch tốn 0,4–0,8 s mỗi lần Run (C++ khoảng 2–3 s khi image lạnh). Rate limit `challenge`
    (20/phút) áp cho cả Run trên server.
  - Theo dõi Active CPU của Vercel Sandbox (Hobby: 5 giờ/tháng).
- **Đáp án lộ:** output `stdio` hiển thị cho test mẫu (giống JS); test ẩn chỉ chạy trên server.
- **Tất định:** challenge concurrency (Go, Java, C++, Rust) chỉ kiểm trạng thái cuối, không kiểm thứ tự
  xen kẽ; dùng đồng hồ giả lập cho thời gian.
- **Sandbox Docker local chạy server dưới root** với 6 capability (SETUID, SETGID, CHOWN,
  DAC_OVERRIDE, FOWNER, KILL) để chuyển sang slot user. Code người học không có capability nào
  (`CapEff` 0), không đọc được job file, môi trường của server hay slot khác, và không có mạng.
  Chỉ dùng cho dev; production dùng microVM.
