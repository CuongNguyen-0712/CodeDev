import CreateStudy from "./createTopicStudy";
import { forwardRef } from "react";

const Item = forwardRef(({ item }, ref) => {
    return (
        <section className="study-topic" ref={ref}>
            {item}
        </section>
    );
});

export default function Study() {
    const dataStudy =
        [
            {
                id: 'js',
                title: "Javascript",
                concept: "JavaScript (JS) là một ngôn ngữ lập trình được sử dụng chủ yếu để tạo các trang web tương tác và động. Ban đầu, JavaScript được phát triển bởi Netscape dưới tên gọi Mocha, sau đó đổi tên thành LiveScript, và cuối cùng là JavaScript. Ngày nay, JavaScript là một phần không thể thiếu của bộ ba công nghệ web cơ bản, bao gồm HTML (HyperText Markup Language), CSS (Cascading Style Sheets), và JavaScript. JavaScript chạy trên trình duyệt của người dùng (client-side), giúp tạo ra các trải nghiệm người dùng tương tác mà không cần tải lại trang. Ngoài ra, với sự phát triển của Node.js, JavaScript cũng có thể chạy trên máy chủ (server-side), giúp xây dựng các ứng dụng web hoàn chỉnh.",
                image: "/image/javascript.ico",
                benefit:
                    [
                        {
                            benefit_name: "Đa Năng",
                            benefit_text: "JavaScript có thể được sử dụng cho cả front-end và back-end, làm cho nó trở thành một ngôn ngữ đa năng."
                        },
                        {
                            benefit_name: "Dễ Học và Sử Dụng",
                            benefit_text: "Cú pháp của JavaScript tương đối đơn giản và dễ hiểu, phù hợp cho người mới bắt đầu."
                        },
                        {
                            benefit_name: "Cộng Đồng Lớn",
                            benefit_text: "JavaScript có một cộng đồng phát triển rất lớn và sôi động, giúp dễ dàng tìm kiếm tài liệu và hỗ trợ."
                        },
                        {
                            benefit_name: "Thư Viện và Framework Phong Phú",
                            benefit_text: "Có rất nhiều thư viện và framework JavaScript nổi tiếng như React, Angular, Vue.js, và Node.js giúp tăng tốc phát triển và nâng cao hiệu quả."
                        },
                        {
                            benefit_name: "Hiệu Suất Cao",
                            benefit_text: "JavaScript có khả năng xử lý nhanh chóng các tác vụ nhờ sự tối ưu hóa của các trình duyệt hiện đại."
                        }
                    ],
                prepare:
                    [
                        {
                            focus_name: "Trình Soạn Thảo Mã: ",
                            focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                        },
                        {
                            focus_name: "Trình Duyệt Web: ",
                            focus: "Chạy và kiểm tra mã JavaScript trên các trình duyệt web hiện đại như Chrome, Firefox, hoặc Edge.",
                        },
                        {
                            focus_name: "Công Cụ Debug: ",
                            focus: "Sử dụng công cụ debug của trình duyệt (như Chrome DevTools) để kiểm tra và gỡ lỗi mã JavaScript.",
                        },
                        {
                            focus_name: "Tài Liệu và Sách: ",
                            focus: "Đọc các tài liệu và sách về JavaScript để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm Eloquent JavaScript và You Don't Know JS."
                        },
                        {
                            focus_name: "Cộng Đồng và Diễn Đàn: ",
                            focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác.",
                        }
                    ],
                courses:
                    [
                        {
                            course_name: "JavaScript Basics: ",
                            course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về cú pháp, biến, hàm, và các khái niệm cơ bản khác.",
                            link_name: "Udemy",
                            link_course: "https://www.udemy.com/course/javascript-basics/",
                        },
                        {
                            course_name: "Advanced JavaScript: ",
                            course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các khái niệm nâng cao như closure, async/await, và event loop.",
                            link_name: "Coursera",
                            link_course: "https://www.coursera.org/specializations/javascript",
                        },
                        {
                            course_name: "Full-Stack Development với JavaScript: ",
                            course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng JavaScript.",
                            link_name: "The Odin Project",
                            link_course: "https://www.theodinproject.com/courses/full-stack-web-development",
                        }
                    ]

            },
            {
                id: 'reactjs',
                title: "ReactJS",
                concept: "ReactJS là một thư viện JavaScript mã nguồn mở được phát triển bởi Facebook, nhằm xây dựng giao diện người dùng (UI) cho các ứng dụng web. ReactJS cho phép các nhà phát triển tạo ra các component có thể tái sử dụng, giúp dễ dàng quản lý và phát triển các ứng dụng phức tạp. Một trong những đặc điểm nổi bật của ReactJS là khả năng cập nhật và render hiệu quả các component khi dữ liệu thay đổi nhờ vào Virtual DOM. ReactJS được sử dụng rộng rãi trong việc phát triển các ứng dụng web hiện đại, từ các trang web đơn giản đến các ứng dụng web phức tạp.",
                image: "/image/reactjs.ico",
                benefit: [
                    {
                        benefit_name: "Tái Sử Dụng Component",
                        benefit_text: "ReactJS cho phép tạo ra các component có thể tái sử dụng, giúp tiết kiệm thời gian và công sức trong quá trình phát triển."
                    },
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Nhờ vào Virtual DOM, ReactJS có khả năng cập nhật và render các component một cách hiệu quả, giúp tăng hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Cộng Đồng Lớn",
                        benefit_text: "ReactJS có một cộng đồng lớn và sôi động, cung cấp nhiều tài nguyên, thư viện và công cụ hỗ trợ."
                    },
                    {
                        benefit_name: "Hỗ Trợ JSX",
                        benefit_text: "ReactJS hỗ trợ JSX, một cú pháp mở rộng của JavaScript, giúp viết mã React dễ dàng và trực quan hơn."
                    },
                    {
                        benefit_name: "Tương Thích Với Các Thư Viện Khác",
                        benefit_text: "ReactJS có thể dễ dàng tích hợp với các thư viện và framework khác như Redux, GraphQL, và nhiều công cụ khác."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Trình Soạn Thảo Mã:",
                        focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Trình Duyệt Web:",
                        focus: "Chạy và kiểm tra mã ReactJS trên các trình duyệt web hiện đại như Chrome, Firefox, hoặc Edge."
                    },
                    {
                        focus_name: "Công Cụ Debug:",
                        focus: "Sử dụng công cụ debug như React Developer Tools để kiểm tra và gỡ lỗi các component React."
                    },
                    {
                        focus_name: "Tài Liệu và Sách:",
                        focus: "Đọc các tài liệu và sách về ReactJS để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm React Documentation và Fullstack React."
                    },
                    {
                        focus_name: "Cộng Đồng và Diễn Đàn:",
                        focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác."
                    }
                ],
                courses: [
                    {
                        course_name: "ReactJS Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về ReactJS, component, state, và props.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/react-101"
                    },
                    {
                        course_name: "Advanced ReactJS:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các khái niệm nâng cao như hooks, context API, và performance optimization.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/react-the-complete-guide/"
                    },
                    {
                        course_name: "Full-Stack Development với ReactJS:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng ReactJS và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-react"
                    }
                ]
            },
            {
                id: 'nextjs',
                title: "Nextjs",
                concept: "Next.js là một framework React mã nguồn mở được phát triển bởi Vercel, giúp xây dựng các ứng dụng web tĩnh và động với hiệu suất cao. Next.js cung cấp các tính năng quan trọng như rendering phía server (Server-Side Rendering - SSR), rendering tĩnh (Static Site Generation - SSG), và hỗ trợ API Routes, giúp tăng cường khả năng phát triển các ứng dụng web hiện đại. Next.js cũng đi kèm với khả năng tối ưu hóa tự động, hỗ trợ TypeScript, và nhiều tính năng khác giúp đơn giản hóa quá trình phát triển.",
                image: "/image/nextjs.ico",
                benefit: [
                    {
                        benefit_name: "Rendering Phía Server",
                        benefit_text: "Next.js hỗ trợ Server-Side Rendering (SSR), giúp cải thiện SEO và tăng tốc độ tải trang."
                    },
                    {
                        benefit_name: "Rendering Tĩnh",
                        benefit_text: "Static Site Generation (SSG) cho phép tạo ra các trang web tĩnh với hiệu suất cao và an toàn hơn."
                    },
                    {
                        benefit_name: "API Routes",
                        benefit_text: "Next.js cung cấp hỗ trợ cho API Routes, cho phép tạo các API endpoint ngay trong ứng dụng Next.js."
                    },
                    {
                        benefit_name: "Tối Ưu Hóa Tự Động",
                        benefit_text: "Next.js tự động tối ưu hóa mã JavaScript và CSS, giúp tăng hiệu suất và giảm thời gian tải trang."
                    },
                    {
                        benefit_name: "Hỗ Trợ TypeScript",
                        benefit_text: "Next.js hỗ trợ TypeScript, giúp phát triển ứng dụng với tính an toàn và quản lý mã nguồn tốt hơn."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Trình Soạn Thảo Mã:",
                        focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Trình Duyệt Web:",
                        focus: "Chạy và kiểm tra mã Next.js trên các trình duyệt web hiện đại như Chrome, Firefox, hoặc Edge."
                    },
                    {
                        focus_name: "Công Cụ Debug:",
                        focus: "Sử dụng công cụ debug như Chrome DevTools hoặc các plugin debug cho Visual Studio Code để kiểm tra và gỡ lỗi mã Next.js."
                    },
                    {
                        focus_name: "Tài Liệu và Sách:",
                        focus: "Đọc các tài liệu và sách về Next.js để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm Next.js Documentation và Next.js by Example."
                    },
                    {
                        focus_name: "Cộng Đồng và Diễn Đàn:",
                        focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác."
                    }
                ],
                courses: [
                    {
                        course_name: "Next.js Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Next.js, cách thiết lập và xây dựng các trang web đơn giản.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/nextjs-react-the-complete-guide/"
                    },
                    {
                        course_name: "Advanced Next.js:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Next.js như SSR, SSG, và API Routes.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/projects/advanced-nextjs"
                    },
                    {
                        course_name: "Full-Stack Development với Next.js:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Next.js và các công nghệ liên quan.",
                        link_name: "Pluralsight",
                        link_course: "https://www.pluralsight.com/courses/full-stack-nextjs"
                    }
                ]
            },
            {
                id: 'vuejs',
                title: "Vuejs",
                concept: "Vue.js là một framework JavaScript mã nguồn mở được phát triển bởi Evan You, nhằm xây dựng giao diện người dùng (UI) và ứng dụng web một cách dễ dàng và linh hoạt. Vue.js tập trung vào việc đơn giản hóa việc phát triển front-end thông qua việc cung cấp một hệ thống component mạnh mẽ, reactive data binding, và các công cụ tiên tiến để quản lý trạng thái và routing. Vue.js cũng nổi bật với cú pháp thân thiện, giúp dễ dàng học và sử dụng cho cả người mới bắt đầu lẫn những lập trình viên giàu kinh nghiệm.",
                image: "/image/vuejs.ico",
                benefit: [
                    {
                        benefit_name: "Cú Pháp Thân Thiện",
                        benefit_text: "Vue.js có cú pháp đơn giản và dễ hiểu, giúp dễ dàng học và sử dụng cho người mới bắt đầu."
                    },
                    {
                        benefit_name: "Component Độc Lập",
                        benefit_text: "Vue.js cho phép tạo ra các component độc lập, giúp quản lý mã nguồn dễ dàng và tái sử dụng code hiệu quả."
                    },
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Vue.js có kích thước nhỏ và tốc độ nhanh, giúp tối ưu hóa hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Cộng Đồng Lớn",
                        benefit_text: "Vue.js có một cộng đồng lớn và sôi động, cung cấp nhiều tài nguyên, thư viện và công cụ hỗ trợ."
                    },
                    {
                        benefit_name: "Tích Hợp Dễ Dàng",
                        benefit_text: "Vue.js có thể dễ dàng tích hợp vào các dự án hiện có hoặc kết hợp với các thư viện khác như Vuex và Vue Router."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Trình Soạn Thảo Mã:",
                        focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Trình Duyệt Web:",
                        focus: "Chạy và kiểm tra mã Vue.js trên các trình duyệt web hiện đại như Chrome, Firefox, hoặc Edge."
                    },
                    {
                        focus_name: "Công Cụ Debug:",
                        focus: "Sử dụng công cụ debug như Vue Devtools để kiểm tra và gỡ lỗi các component Vue."
                    },
                    {
                        focus_name: "Tài Liệu và Sách:",
                        focus: "Đọc các tài liệu và sách về Vue.js để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm Vue.js Documentation và The Majesty of Vue.js."
                    },
                    {
                        focus_name: "Cộng Đồng và Diễn Đàn:",
                        focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác."
                    }
                ],
                courses: [
                    {
                        course_name: "Vue.js Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Vue.js, cách thiết lập và xây dựng các trang web đơn giản.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/learn-vue-js"
                    },
                    {
                        course_name: "Advanced Vue.js:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Vue.js như Vuex, Vue Router và component lifecycle.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/vuejs-2-the-complete-guide/"
                    },
                    {
                        course_name: "Full-Stack Development với Vue.js:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Vue.js và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/learn/full-stack-vue-js"
                    }
                ]
            },
            {
                id: 'nodejs',
                title: "Node.js",
                concept: "Node.js là một môi trường chạy JavaScript mã nguồn mở, đa nền tảng, được xây dựng trên V8 JavaScript engine của Chrome. Node.js cho phép các nhà phát triển chạy JavaScript trên máy chủ, thay vì chỉ trong trình duyệt, giúp xây dựng các ứng dụng web back-end một cách hiệu quả và mở rộng được. Node.js nổi bật với khả năng xử lý đồng thời nhiều kết nối bằng cách sử dụng mô hình sự kiện không đồng bộ (event-driven non-blocking I/O), phù hợp cho các ứng dụng cần hiệu suất cao như ứng dụng thời gian thực, API và dịch vụ microservices.",
                image: "/image/nodejs.ico",
                benefit: [
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Node.js có khả năng xử lý đồng thời nhiều kết nối nhờ mô hình sự kiện không đồng bộ, giúp tăng hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Dễ Học",
                        benefit_text: "Các lập trình viên JavaScript dễ dàng chuyển sang phát triển back-end bằng Node.js mà không cần học một ngôn ngữ mới."
                    },
                    {
                        benefit_name: "Cộng Đồng Lớn",
                        benefit_text: "Node.js có một cộng đồng phát triển lớn và sôi động, cung cấp nhiều tài nguyên, thư viện và công cụ hỗ trợ."
                    },
                    {
                        benefit_name: "NPM",
                        benefit_text: "Node.js đi kèm với Node Package Manager (NPM), một hệ thống quản lý gói mạnh mẽ, giúp dễ dàng cài đặt và quản lý các thư viện."
                    },
                    {
                        benefit_name: "Mở Rộng Dễ Dàng",
                        benefit_text: "Node.js có thể dễ dàng mở rộng và tích hợp với các công nghệ khác, phù hợp cho các hệ thống microservices và ứng dụng quy mô lớn."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Trình Soạn Thảo Mã:",
                        focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Trình Duyệt Web:",
                        focus: "Chạy và kiểm tra mã Node.js trên các trình duyệt web hiện đại như Chrome, Firefox, hoặc Edge."
                    },
                    {
                        focus_name: "Công Cụ Debug:",
                        focus: "Sử dụng công cụ debug như Chrome DevTools hoặc các plugin debug cho Visual Studio Code để kiểm tra và gỡ lỗi mã Node.js."
                    },
                    {
                        focus_name: "Tài Liệu và Sách:",
                        focus: "Đọc các tài liệu và sách về Node.js để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm Node.js Documentation và Node.js Design Patterns."
                    },
                    {
                        focus_name: "Cộng Đồng và Diễn Đàn:",
                        focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác."
                    }
                ],
                courses: [
                    {
                        course_name: "Node.js Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Node.js, cách thiết lập và xây dựng các ứng dụng web đơn giản.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/learn-node-js"
                    },
                    {
                        course_name: "Advanced Node.js:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Node.js như xử lý sự kiện, streaming, và security.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-nodejs/"
                    },
                    {
                        course_name: "Full-Stack Development với Node.js:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Node.js và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-nodejs"
                    }
                ]
            },
            {
                id: 'go',
                title: "Go (Golang)",
                concept: "Go, hay còn gọi là Golang, là một ngôn ngữ lập trình mã nguồn mở được phát triển bởi Google. Go được thiết kế với mục tiêu đơn giản, hiệu quả và an toàn, phù hợp cho việc xây dựng các hệ thống phân tán, dịch vụ web, và các ứng dụng cần hiệu suất cao. Go nổi bật với cú pháp gọn gàng, hỗ trợ concurrency mạnh mẽ nhờ goroutines và channels, cùng với khả năng biên dịch nhanh chóng. Go đã trở thành một lựa chọn phổ biến cho các dự án quy mô lớn, nơi yêu cầu hiệu suất và độ tin cậy cao.",
                image: "/image/golang.ico",
                benefit: [
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Go được thiết kế để có hiệu suất cao và khả năng biên dịch nhanh chóng, phù hợp cho các ứng dụng cần tốc độ."
                    },
                    {
                        benefit_name: "Concurrency Mạnh Mẽ",
                        benefit_text: "Go hỗ trợ concurrency mạnh mẽ thông qua goroutines và channels, giúp xử lý đồng thời nhiều tác vụ một cách hiệu quả."
                    },
                    {
                        benefit_name: "Cú Pháp Gọn Gàng",
                        benefit_text: "Cú pháp của Go đơn giản và gọn gàng, giúp dễ dàng học và sử dụng cho cả người mới bắt đầu và những lập trình viên giàu kinh nghiệm."
                    },
                    {
                        benefit_name: "Quản Lý Bộ Nhớ Tốt",
                        benefit_text: "Go có hệ thống quản lý bộ nhớ tốt và tính năng garbage collection, giúp giảm thiểu lỗi và tối ưu hóa hiệu suất."
                    },
                    {
                        benefit_name: "Cộng Đồng và Hỗ Trợ",
                        benefit_text: "Go có một cộng đồng phát triển lớn và sôi động, cung cấp nhiều tài nguyên, thư viện và công cụ hỗ trợ."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Trình Soạn Thảo Mã:",
                        focus: "Sử dụng các trình soạn thảo mã như Visual Studio Code, Sublime Text, hoặc Atom để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Công Cụ Debug:",
                        focus: "Sử dụng các công cụ debug như Delve để kiểm tra và gỡ lỗi mã Go."
                    },
                    {
                        focus_name: "Tài Liệu và Sách:",
                        focus: "Đọc các tài liệu và sách về Go để nắm vững kiến thức. Một số tài liệu đáng chú ý bao gồm Go Documentation và The Go Programming Language."
                    },
                    {
                        focus_name: "Cộng Đồng và Diễn Đàn:",
                        focus: "Tham gia các cộng đồng trực tuyến như Stack Overflow, Reddit, hoặc các nhóm Facebook để trao đổi và học hỏi từ những người khác."
                    }
                ],
                courses: [
                    {
                        course_name: "Go Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Go, cách thiết lập và xây dựng các ứng dụng đơn giản.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/learn-go"
                    },
                    {
                        course_name: "Advanced Go:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Go như concurrency, networking, và performance optimization.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/learn-go-the-complete-bootcamp-course-golang/"
                    },
                    {
                        course_name: "Full-Stack Development với Go:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Go và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/learn/full-stack-go"
                    }
                ]
            },
            {
                id: "dart",
                title: "Dart",
                concept: "Dart là một ngôn ngữ lập trình mã nguồn mở được phát triển bởi Google, được sử dụng chủ yếu để xây dựng các ứng dụng web và di động. Dart được thiết kế để dễ học, dễ sử dụng và có hiệu suất cao, đặc biệt là khi sử dụng với framework Flutter để xây dựng các ứng dụng di động cross-platform. Dart nổi bật với cú pháp đơn giản, hệ thống type mạnh mẽ, và khả năng biên dịch nhanh chóng. Với Dart, các nhà phát triển có thể viết mã một lần và triển khai trên nhiều nền tảng khác nhau.",
                image: "/image/dart.svg",
                benefit: [
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Dart được biên dịch thành mã máy hoặc JavaScript, giúp tối ưu hóa hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Cú Pháp Đơn Giản",
                        benefit_text: "Cú pháp của Dart dễ học và dễ sử dụng, phù hợp cho cả người mới bắt đầu và lập trình viên giàu kinh nghiệm."
                    },
                    {
                        benefit_name: "Type System Mạnh Mẽ",
                        benefit_text: "Dart có hệ thống type mạnh mẽ giúp giảm thiểu lỗi trong quá trình phát triển."
                    },
                    {
                        benefit_name: "Cross-Platform",
                        benefit_text: "Với Flutter, Dart cho phép xây dựng các ứng dụng di động cross-platform, chạy trên cả iOS và Android."
                    },
                    {
                        benefit_name: "Cộng Đồng và Tài Nguyên",
                        benefit_text: "Dart có một cộng đồng phát triển tích cực và nhiều tài nguyên học tập phong phú."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Cài Đặt Dart SDK:",
                        focus: "Tải và cài đặt Dart SDK từ trang chủ Dart để bắt đầu viết mã Dart trên máy của bạn."
                    },
                    {
                        focus_name: "Sử Dụng IDE/Editor:",
                        focus: "Sử dụng các IDE hoặc trình soạn thảo mã như Visual Studio Code, IntelliJ IDEA hoặc Android Studio với plugin hỗ trợ Dart."
                    },
                    {
                        focus_name: "Khám Phá Flutter:",
                        focus: "Tìm hiểu và cài đặt Flutter nếu bạn muốn phát triển ứng dụng di động cross-platform bằng Dart."
                    },
                    {
                        focus_name: "Đọc Tài Liệu Chính Thức:",
                        focus: "Tham khảo tài liệu chính thức của Dart để nắm vững các khái niệm và cú pháp cơ bản của ngôn ngữ."
                    },
                    {
                        focus_name: "Tham Gia Cộng Đồng:",
                        focus: "Tham gia các diễn đàn, nhóm Facebook, hoặc subreddit liên quan đến Dart để trao đổi và học hỏi từ cộng đồng."
                    }
                ],
                courses: [
                    {
                        course_name: "Dart Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Dart, cách thiết lập và viết các chương trình đơn giản.",
                        link_name: "Udacity",
                        link_course: "https://www.udacity.com/course/dart-programming--ud905"
                    },
                    {
                        course_name: "Advanced Dart:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Dart như asynchronous programming, streams và collections.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-dart-programming/"
                    },
                    {
                        course_name: "Full-Stack Development với Dart:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web và di động hoàn chỉnh từ front-end đến back-end bằng Dart và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-dart"
                    }
                ]
            },
            {
                id: 'swift',
                title: "Swift",
                concept: "Swift là một ngôn ngữ lập trình mạnh mẽ và trực quan được phát triển bởi Apple, được sử dụng để xây dựng các ứng dụng cho iOS, macOS, watchOS, và tvOS. Swift được thiết kế để dễ học và sử dụng, với cú pháp hiện đại và các tính năng tiên tiến nhằm đảm bảo mã nguồn an toàn và hiệu quả. Swift nổi bật với khả năng hiệu suất cao, an toàn về bộ nhớ, và hỗ trợ mạnh mẽ cho lập trình hướng đối tượng và lập trình hàm. Với Swift, các nhà phát triển có thể tạo ra các ứng dụng mạnh mẽ và tinh tế cho hệ sinh thái của Apple.",
                image: "/image/swift.ico",
                benefit: [
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Swift được biên dịch thành mã máy, giúp tối ưu hóa hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Cú Pháp Hiện Đại",
                        benefit_text: "Cú pháp của Swift đơn giản, dễ học và sử dụng, phù hợp cho cả người mới bắt đầu và lập trình viên giàu kinh nghiệm."
                    },
                    {
                        benefit_name: "An Toàn Về Bộ Nhớ",
                        benefit_text: "Swift có hệ thống quản lý bộ nhớ mạnh mẽ và tính năng bảo vệ an toàn, giúp giảm thiểu lỗi trong quá trình phát triển."
                    },
                    {
                        benefit_name: "Hỗ Trợ Cross-Platform",
                        benefit_text: "Swift có thể được sử dụng để phát triển ứng dụng trên nhiều nền tảng của Apple như iOS, macOS, watchOS, và tvOS."
                    },
                    {
                        benefit_name: "Cộng Đồng và Tài Nguyên",
                        benefit_text: "Swift có một cộng đồng phát triển tích cực và nhiều tài nguyên học tập phong phú."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Cài Đặt Xcode:",
                        focus: "Tải và cài đặt Xcode từ Mac App Store để bắt đầu viết mã Swift và phát triển ứng dụng cho hệ sinh thái của Apple."
                    },
                    {
                        focus_name: "Sử Dụng IDE/Editor:",
                        focus: "Sử dụng Xcode hoặc các trình soạn thảo mã khác hỗ trợ Swift để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Khám Phá SwiftUI:",
                        focus: "Tìm hiểu và sử dụng SwiftUI để xây dựng giao diện người dùng một cách nhanh chóng và trực quan."
                    },
                    {
                        focus_name: "Đọc Tài Liệu Chính Thức:",
                        focus: "Tham khảo tài liệu chính thức của Swift để nắm vững các khái niệm và cú pháp cơ bản của ngôn ngữ."
                    },
                    {
                        focus_name: "Tham Gia Cộng Đồng:",
                        focus: "Tham gia các diễn đàn, nhóm Facebook, hoặc subreddit liên quan đến Swift để trao đổi và học hỏi từ cộng đồng."
                    }
                ],
                courses: [
                    {
                        course_name: "Swift Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Swift, cách thiết lập và viết các chương trình đơn giản.",
                        link_name: "Udacity",
                        link_course: "https://www.udacity.com/course/swift-for-beginners--ud585"
                    },
                    {
                        course_name: "Advanced Swift:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Swift như protocol-oriented programming, generics và error handling.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-swift-programming/"
                    },
                    {
                        course_name: "Full-Stack Development với Swift:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng hoàn chỉnh từ front-end đến back-end bằng Swift và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-swift"
                    }
                ]
            },
            {
                id: "rust",
                title: "Rust",
                concept: "Rust là một ngôn ngữ lập trình hệ thống mã nguồn mở được phát triển bởi Mozilla, nổi tiếng với khả năng an toàn bộ nhớ và hiệu suất cao. Rust được thiết kế để ngăn chặn các lỗi tràn bộ nhớ và data race, hai vấn đề phổ biến trong lập trình hệ thống. Rust hỗ trợ cả lập trình hàm và lập trình hướng đối tượng, với cú pháp hiện đại và tính năng mạnh mẽ. Với Rust, các nhà phát triển có thể xây dựng các hệ thống phần mềm an toàn, hiệu quả và có hiệu suất cao, từ các ứng dụng hệ thống đến các dịch vụ web quy mô lớn.",
                image: "/image/rust.ico",
                benefit: [
                    {
                        benefit_name: "An Toàn Bộ Nhớ",
                        benefit_text: "Rust có khả năng ngăn chặn các lỗi tràn bộ nhớ và data race nhờ hệ thống quản lý bộ nhớ mạnh mẽ."
                    },
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Rust được biên dịch thành mã máy, giúp tối ưu hóa hiệu suất của ứng dụng."
                    },
                    {
                        benefit_name: "Cú Pháp Hiện Đại",
                        benefit_text: "Cú pháp của Rust hiện đại và mạnh mẽ, phù hợp cho cả lập trình hướng đối tượng và lập trình hàm."
                    },
                    {
                        benefit_name: "Concurrency Mạnh Mẽ",
                        benefit_text: "Rust hỗ trợ concurrency mạnh mẽ, giúp xử lý đồng thời nhiều tác vụ một cách hiệu quả."
                    },
                    {
                        benefit_name: "Cộng Đồng và Tài Nguyên",
                        benefit_text: "Rust có một cộng đồng phát triển tích cực và nhiều tài nguyên học tập phong phú."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Cài Đặt Rust:",
                        focus: "Tải và cài đặt Rust từ trang chủ Rust để bắt đầu viết mã Rust trên máy của bạn."
                    },
                    {
                        focus_name: "Sử Dụng Cargo:",
                        focus: "Cargo là công cụ quản lý gói và build system của Rust, giúp dễ dàng quản lý các thư viện và dự án."
                    },
                    {
                        focus_name: "Khám Phá Crates.io:",
                        focus: "Crates.io là kho lưu trữ các thư viện Rust, giúp bạn dễ dàng tìm kiếm và tích hợp các thư viện vào dự án của mình."
                    },
                    {
                        focus_name: "Đọc Tài Liệu Chính Thức:",
                        focus: "Tham khảo tài liệu chính thức của Rust để nắm vững các khái niệm và cú pháp cơ bản của ngôn ngữ."
                    },
                    {
                        focus_name: "Tham Gia Cộng Đồng:",
                        focus: "Tham gia các diễn đàn, nhóm Facebook, hoặc subreddit liên quan đến Rust để trao đổi và học hỏi từ cộng đồng."
                    }
                ],
                courses: [
                    {
                        course_name: "Rust Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Rust, cách thiết lập và viết các chương trình đơn giản.",
                        link_name: "Udacity",
                        link_course: "https://www.udacity.com/course/rust-for-beginners--ud210"
                    },
                    {
                        course_name: "Advanced Rust:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Rust như ownership, lifetimes và concurrency.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-rust-programming/"
                    },
                    {
                        course_name: "Full-Stack Development với Rust:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng hoàn chỉnh từ front-end đến back-end bằng Rust và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-rust"
                    }
                ]
            },
            {
                id: "ruby",
                title: "Ruby",
                concept: "Ruby là một ngôn ngữ lập trình mã nguồn mở, hướng đối tượng, được phát triển bởi Yukihiro 'Matz' Matsumoto vào giữa những năm 1990. Ruby nổi tiếng với cú pháp đơn giản và dễ đọc, nhấn mạnh vào tính năng lập trình hướng đối tượng và khả năng mở rộng. Ruby thường được sử dụng để phát triển các ứng dụng web nhờ vào framework Ruby on Rails, giúp tăng tốc quá trình phát triển và triển khai ứng dụng. Với Ruby, các nhà phát triển có thể tạo ra các ứng dụng mạnh mẽ và dễ bảo trì với ít mã hơn.",
                image: "/image/ruby.ico",
                benefit: [
                    {
                        benefit_name: "Cú Pháp Đơn Giản",
                        benefit_text: "Ruby có cú pháp dễ đọc và dễ viết, giúp tăng năng suất cho các nhà phát triển."
                    },
                    {
                        benefit_name: "Lập Trình Hướng Đối Tượng",
                        benefit_text: "Ruby hỗ trợ mạnh mẽ cho lập trình hướng đối tượng, giúp tổ chức mã nguồn một cách rõ ràng và dễ bảo trì."
                    },
                    {
                        benefit_name: "Framework Mạnh Mẽ",
                        benefit_text: "Ruby on Rails là một framework nổi tiếng của Ruby, giúp tăng tốc quá trình phát triển các ứng dụng web."
                    },
                    {
                        benefit_name: "Cộng Đồng Lớn",
                        benefit_text: "Ruby có một cộng đồng phát triển rộng lớn và năng động, cung cấp nhiều tài nguyên học tập và hỗ trợ."
                    },
                    {
                        benefit_name: "Tính Năng Mở Rộng",
                        benefit_text: "Ruby có khả năng mở rộng mạnh mẽ với nhiều gem (thư viện) có sẵn, giúp tiết kiệm thời gian và công sức cho các nhà phát triển."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Cài Đặt Ruby:",
                        focus: "Tải và cài đặt Ruby từ trang chủ Ruby hoặc sử dụng trình quản lý phiên bản như RVM hoặc rbenv để quản lý các phiên bản Ruby trên máy của bạn."
                    },
                    {
                        focus_name: "Sử Dụng Bundler:",
                        focus: "Bundler là công cụ quản lý gói của Ruby, giúp dễ dàng quản lý các gem và phụ thuộc trong dự án của bạn."
                    },
                    {
                        focus_name: "Khám Phá Ruby on Rails:",
                        focus: "Tìm hiểu và sử dụng Ruby on Rails nếu bạn muốn phát triển ứng dụng web một cách nhanh chóng và hiệu quả."
                    },
                    {
                        focus_name: "Đọc Tài Liệu Chính Thức:",
                        focus: "Tham khảo tài liệu chính thức của Ruby để nắm vững các khái niệm và cú pháp cơ bản của ngôn ngữ."
                    },
                    {
                        focus_name: "Tham Gia Cộng Đồng:",
                        focus: "Tham gia các diễn đàn, nhóm Facebook, hoặc subreddit liên quan đến Ruby để trao đổi và học hỏi từ cộng đồng."
                    }
                ],
                courses: [
                    {
                        course_name: "Ruby Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Ruby, cách thiết lập và viết các chương trình đơn giản.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/learn-ruby"
                    },
                    {
                        course_name: "Advanced Ruby:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Ruby như metaprogramming, blocks và modules.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-ruby-programming/"
                    },
                    {
                        course_name: "Full-Stack Development với Ruby on Rails:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Ruby và Ruby on Rails.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-ruby-on-rails"
                    }
                ]
            },
            {
                id: "python",
                title: "Python",
                concept: "Python là một ngôn ngữ lập trình mã nguồn mở, đa năng và dễ học, được tạo ra bởi Guido van Rossum và ra mắt lần đầu vào năm 1991. Python nổi tiếng với cú pháp rõ ràng, dễ đọc và dễ viết, giúp tăng năng suất cho các nhà phát triển. Python hỗ trợ cả lập trình hướng đối tượng và lập trình hàm, và được sử dụng rộng rãi trong nhiều lĩnh vực như phát triển web, khoa học dữ liệu, trí tuệ nhân tạo, tự động hóa, và nhiều lĩnh vực khác. Với thư viện phong phú và cộng đồng lớn, Python là một trong những ngôn ngữ lập trình phổ biến nhất hiện nay.",
                image: "/image/python.ico",
                benefit: [
                    {
                        benefit_name: "Dễ Học và Sử Dụng",
                        benefit_text: "Python có cú pháp đơn giản và dễ hiểu, phù hợp cho người mới bắt đầu học lập trình."
                    },
                    {
                        benefit_name: "Đa Năng",
                        benefit_text: "Python có thể được sử dụng trong nhiều lĩnh vực khác nhau, từ phát triển web, khoa học dữ liệu đến trí tuệ nhân tạo và tự động hóa."
                    },
                    {
                        benefit_name: "Thư Viện Phong Phú",
                        benefit_text: "Python có một hệ sinh thái thư viện và framework phong phú, giúp tăng tốc quá trình phát triển và giải quyết nhiều vấn đề khác nhau."
                    },
                    {
                        benefit_name: "Cộng Đồng Lớn",
                        benefit_text: "Python có một cộng đồng phát triển rộng lớn và năng động, cung cấp nhiều tài nguyên học tập và hỗ trợ."
                    },
                    {
                        benefit_name: "Hiệu Suất Cao",
                        benefit_text: "Python có thể tích hợp với các ngôn ngữ khác như C/C++ để tối ưu hóa hiệu suất."
                    }
                ],
                prepare: [
                    {
                        focus_name: "Cài Đặt Python:",
                        focus: "Tải và cài đặt Python từ trang chủ Python để bắt đầu viết mã Python trên máy của bạn."
                    },
                    {
                        focus_name: "Sử Dụng IDE/Editor:",
                        focus: "Sử dụng các IDE hoặc trình soạn thảo mã như PyCharm, Visual Studio Code, hoặc Jupyter Notebook để viết và quản lý mã nguồn."
                    },
                    {
                        focus_name: "Khám Phá Thư Viện và Framework:",
                        focus: "Tìm hiểu và sử dụng các thư viện và framework phổ biến của Python như Django, Flask, NumPy, Pandas, và TensorFlow."
                    },
                    {
                        focus_name: "Đọc Tài Liệu Chính Thức:",
                        focus: "Tham khảo tài liệu chính thức của Python để nắm vững các khái niệm và cú pháp cơ bản của ngôn ngữ."
                    },
                    {
                        focus_name: "Tham Gia Cộng Đồng:",
                        focus: "Tham gia các diễn đàn, nhóm Facebook, hoặc subreddit liên quan đến Python để trao đổi và học hỏi từ cộng đồng."
                    }
                ],
                courses: [
                    {
                        course_name: "Python Basics:",
                        course: "Khóa học này dành cho người mới bắt đầu, cung cấp kiến thức cơ bản về Python, cách thiết lập và viết các chương trình đơn giản.",
                        link_name: "Codecademy",
                        link_course: "https://www.codecademy.com/learn/learn-python-3"
                    },
                    {
                        course_name: "Advanced Python:",
                        course: "Khóa học này dành cho những người đã có kiến thức cơ bản và muốn học sâu hơn về các tính năng nâng cao của Python như decorators, context managers và asynchronous programming.",
                        link_name: "Udemy",
                        link_course: "https://www.udemy.com/course/advanced-python-programming/"
                    },
                    {
                        course_name: "Full-Stack Development với Python:",
                        course: "Khóa học này giúp bạn học cách xây dựng các ứng dụng web hoàn chỉnh từ front-end đến back-end bằng Python và các công nghệ liên quan.",
                        link_name: "Coursera",
                        link_course: "https://www.coursera.org/specializations/full-stack-python"
                    }
                ]
            }
        ]


    return (
        <>
            {dataStudy.map((item, index) => (
                <Item item={
                    <CreateStudy
                        props={{ title: item.title, concept: item.concept, benefit: item.benefit, image: item.image, courses: item.courses, prepare: item.prepare }}
                        link={item.id}
                    />
                }
                    key={index}
                />
            ))}
        </>
    )
}