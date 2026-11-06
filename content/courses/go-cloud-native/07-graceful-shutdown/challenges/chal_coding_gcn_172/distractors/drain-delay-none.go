// @piece drain-delay: Keep serving while the load balancers forget this pod
g.Sleep(0) // Kubernetes already took the pod out of the Service
