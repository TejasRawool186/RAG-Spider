/**
 * Comprehensive Logging and Monitoring for RAG Spider
 * 
 * This module provides structured logging, performance metrics collection,
 * and monitoring capabilities for the web crawling operations.
 * 
 * Requirements: 4.2, 4.3
 */

/**
 * Log levels for different types of messages
 */
export const LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Performance metrics categories
 */
export const MetricCategory = {
    EXTRACTION: 'extraction',
    CHUNKING: 'chunking',
    PROCESSING: 'processing',
    NETWORK: 'network',
    MEMORY: 'memory'
};

/**
 * Structured logger with performance monitoring
 */
export class Logger {
    constructor(config = {}) {
        this.config = {
            level: LogLevel.INFO,
            enableMetrics: true,
            enableMemoryMonitoring: true,
            metricsInterval: 30000, // 30 seconds
            ...config
        };
        
        this.metrics = {
            counters: new Map(),
            timers: new Map(),
            gauges: new Map(),
            histograms: new Map()
        };
        
        this.performanceData = {
            startTime: Date.now(),
            processingTimes: [],
            memoryUsage: [],
            errorCounts: new Map(),
            successCounts: new Map()
        };
        
        if (this.config.enableMemoryMonitoring) {
            this.startMemoryMonitoring();
        }
    }
    
    /**
     * Logs a debug message
     */
    debug(message, context = {}) {
        this.log(LogLevel.DEBUG, message, context);
    }
    
    /**
     * Logs an info message
     */
    info(message, context = {}) {
        this.log(LogLevel.INFO, message, context);
    }
    
    /**
     * Logs a warning message
     */
    warn(message, context = {}) {
        this.log(LogLevel.WARN, message, context);
    }
    
    /**
     * Logs an error message
     */
    error(message, context = {}) {
        this.log(LogLevel.ERROR, message, context);
    }
    
    /**
     * Logs a critical message
     */
    critical(message, context = {}) {
        this.log(LogLevel.CRITICAL, message, context);
    }
    
    /**
     * Core logging method with structured output
     */
    log(level, message, context = {}) {
        if (!this.shouldLog(level)) {
            return;
        }
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            context: context,
            memoryUsage: this.getCurrentMemoryUsage(),
            processId: process.pid
        };
        
        // Output to console with appropriate formatting
        this.outputLog(logEntry);
        
        // Update metrics
        if (this.config.enableMetrics) {
            this.updateLogMetrics(level);
        }
    }
    
    /**
     * Determines if a log level should be output
     */
    shouldLog(level) {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
        const currentLevelIndex = levels.indexOf(this.config.level);
        const messageLevelIndex = levels.indexOf(level);
        
        return messageLevelIndex >= currentLevelIndex;
    }
    
    /**
     * Outputs formatted log entry to console
     */
    outputLog(logEntry) {
        const { timestamp, level, message, context } = logEntry;
        const contextStr = Object.keys(context).length > 0 ? ` | ${JSON.stringify(context)}` : '';
        
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(`🔍 [${timestamp}] DEBUG: ${message}${contextStr}`);
                break;
            case LogLevel.INFO:
                console.log(`ℹ️ [${timestamp}] INFO: ${message}${contextStr}`);
                break;
            case LogLevel.WARN:
                console.warn(`⚠️ [${timestamp}] WARN: ${message}${contextStr}`);
                break;
            case LogLevel.ERROR:
                console.error(`❌ [${timestamp}] ERROR: ${message}${contextStr}`);
                break;
            case LogLevel.CRITICAL:
                console.error(`🚨 [${timestamp}] CRITICAL: ${message}${contextStr}`);
                break;
        }
    }
    
    /**
     * Starts a performance timer
     */
    startTimer(name, category = MetricCategory.PROCESSING) {
        const timerId = `${category}:${name}`;
        this.metrics.timers.set(timerId, {
            startTime: Date.now(),
            category: category,
            name: name
        });
        
        // Skip logging for timer start to avoid circular dependencies during initialization
        return timerId;
    }
    
    /**
     * Ends a performance timer and records the duration
     */
    endTimer(timerId) {
        const timer = this.metrics.timers.get(timerId);
        if (!timer) {
            this.warn(`Timer not found: ${timerId}`);
            return 0;
        }
        
        const duration = Date.now() - timer.startTime;
        this.metrics.timers.delete(timerId);
        
        // Record in histogram
        const histogramKey = `${timer.category}:${timer.name}`;
        if (!this.metrics.histograms.has(histogramKey)) {
            this.metrics.histograms.set(histogramKey, []);
        }
        this.metrics.histograms.get(histogramKey).push(duration);
        
        // Add to performance data
        this.performanceData.processingTimes.push({
            name: timer.name,
            category: timer.category,
            duration: duration,
            timestamp: Date.now()
        });
        
        // Skip logging for timer end to avoid circular dependencies
        
        return duration;
    }
    
    /**
     * Increments a counter metric
     */
    incrementCounter(name, category = MetricCategory.PROCESSING, value = 1, skipLogging = false) {
        const counterKey = `${category}:${name}`;
        const current = this.metrics.counters.get(counterKey) || 0;
        this.metrics.counters.set(counterKey, current + value);
        
        if (!skipLogging) {
            this.debug(`Counter incremented: ${name}`, { 
                category, 
                value, 
                total: current + value 
            });
        }
    }
    
    /**
     * Sets a gauge metric value
     */
    setGauge(name, category = MetricCategory.PROCESSING, value, skipLogging = false) {
        const gaugeKey = `${category}:${name}`;
        this.metrics.gauges.set(gaugeKey, {
            value: value,
            timestamp: Date.now()
        });
        
        if (!skipLogging) {
            this.debug(`Gauge set: ${name}`, { category, value });
        }
    }
    
    /**
     * Records a successful operation
     */
    recordSuccess(operation, category = MetricCategory.PROCESSING, duration = null) {
        const key = `${category}:${operation}`;
        const current = this.performanceData.successCounts.get(key) || 0;
        this.performanceData.successCounts.set(key, current + 1);
        
        this.incrementCounter(`${operation}_success`, category);
        
        if (duration !== null) {
            this.recordProcessingTime(operation, category, duration);
        }
        
        this.info(`Operation succeeded: ${operation}`, { category, duration });
    }
    
    /**
     * Records a failed operation
     */
    recordError(operation, category = MetricCategory.PROCESSING, error = null) {
        const key = `${category}:${operation}`;
        const current = this.performanceData.errorCounts.get(key) || 0;
        this.performanceData.errorCounts.set(key, current + 1);
        
        this.incrementCounter(`${operation}_error`, category);
        
        this.error(`Operation failed: ${operation}`, { 
            category, 
            error: error ? error.message : 'Unknown error' 
        });
    }
    
    /**
     * Records processing time for an operation
     */
    recordProcessingTime(operation, category, duration) {
        this.performanceData.processingTimes.push({
            name: operation,
            category: category,
            duration: duration,
            timestamp: Date.now()
        });
        
        // Also update histogram
        const histogramKey = `${category}:${operation}`;
        if (!this.metrics.histograms.has(histogramKey)) {
            this.metrics.histograms.set(histogramKey, []);
        }
        this.metrics.histograms.get(histogramKey).push(duration);
    }
    
    /**
     * Gets current memory usage information
     */
    getCurrentMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024) // MB
        };
    }
    
    /**
     * Starts memory monitoring at regular intervals
     */
    startMemoryMonitoring() {
        this.memoryMonitorInterval = setInterval(() => {
            const memoryUsage = this.getCurrentMemoryUsage();
            this.performanceData.memoryUsage.push({
                ...memoryUsage,
                timestamp: Date.now()
            });
            
            // Set gauge metrics for current memory usage
            this.setGauge('memory_rss', MetricCategory.MEMORY, memoryUsage.rss);
            this.setGauge('memory_heap_used', MetricCategory.MEMORY, memoryUsage.heapUsed);
            this.setGauge('memory_heap_total', MetricCategory.MEMORY, memoryUsage.heapTotal);
            
            // Warn if memory usage is high
            if (memoryUsage.heapUsed > 500) { // 500MB threshold
                this.warn('High memory usage detected', memoryUsage);
            }
            
        }, this.config.metricsInterval);
    }
    
    /**
     * Stops memory monitoring
     */
    stopMemoryMonitoring() {
        if (this.memoryMonitorInterval) {
            clearInterval(this.memoryMonitorInterval);
            this.memoryMonitorInterval = null;
        }
    }
    
    /**
     * Updates log-related metrics (without logging to prevent circular calls)
     */
    updateLogMetrics(level) {
        // Direct counter updates without logging to prevent circular dependency
        const counterKey = `${MetricCategory.PROCESSING}:log_${level}`;
        const current = this.metrics.counters.get(counterKey) || 0;
        this.metrics.counters.set(counterKey, current + 1);
        
        if (level === LogLevel.ERROR || level === LogLevel.CRITICAL) {
            const errorCounterKey = `${MetricCategory.PROCESSING}:total_errors`;
            const errorCurrent = this.metrics.counters.get(errorCounterKey) || 0;
            this.metrics.counters.set(errorCounterKey, errorCurrent + 1);
        }
    }
    
    /**
     * Gets comprehensive performance statistics
     */
    getPerformanceStats() {
        const now = Date.now();
        const uptime = now - this.performanceData.startTime;
        
        // Calculate processing time statistics
        const processingStats = this.calculateProcessingStats();
        
        // Calculate memory statistics
        const memoryStats = this.calculateMemoryStats();
        
        // Calculate success rates
        const successRates = this.calculateSuccessRates();
        
        return {
            uptime: uptime,
            uptimeFormatted: this.formatDuration(uptime),
            processing: processingStats,
            memory: memoryStats,
            successRates: successRates,
            counters: Object.fromEntries(this.metrics.counters),
            gauges: Object.fromEntries(
                Array.from(this.metrics.gauges.entries()).map(([key, value]) => [key, value.value])
            ),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Calculates processing time statistics
     */
    calculateProcessingStats() {
        const times = this.performanceData.processingTimes;
        if (times.length === 0) {
            return { count: 0, average: 0, min: 0, max: 0 };
        }
        
        const durations = times.map(t => t.duration);
        const sum = durations.reduce((a, b) => a + b, 0);
        
        return {
            count: times.length,
            average: Math.round(sum / times.length),
            min: Math.min(...durations),
            max: Math.max(...durations),
            total: sum
        };
    }
    
    /**
     * Calculates memory usage statistics
     */
    calculateMemoryStats() {
        const usage = this.performanceData.memoryUsage;
        if (usage.length === 0) {
            return this.getCurrentMemoryUsage();
        }
        
        const latest = usage[usage.length - 1];
        const heapUsages = usage.map(u => u.heapUsed);
        
        return {
            current: latest,
            peak: Math.max(...heapUsages),
            average: Math.round(heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length),
            samples: usage.length
        };
    }
    
    /**
     * Calculates success rates for operations
     */
    calculateSuccessRates() {
        const rates = {};
        
        for (const [key, successCount] of this.performanceData.successCounts) {
            const errorCount = this.performanceData.errorCounts.get(key) || 0;
            const total = successCount + errorCount;
            
            if (total > 0) {
                rates[key] = {
                    successCount,
                    errorCount,
                    total,
                    successRate: Math.round((successCount / total) * 100)
                };
            }
        }
        
        return rates;
    }
    
    /**
     * Formats duration in milliseconds to human-readable format
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    /**
     * Logs performance summary
     */
    logPerformanceSummary() {
        const stats = this.getPerformanceStats();
        
        this.info('Performance Summary', {
            uptime: stats.uptimeFormatted,
            processing: stats.processing,
            memory: stats.memory.current,
            successRates: stats.successRates
        });
    }
    
    /**
     * Cleans up resources
     */
    cleanup() {
        this.stopMemoryMonitoring();
        this.logPerformanceSummary();
        this.info('Logger cleanup completed');
    }
}

/**
 * Creates a new logger instance
 */
export function createLogger(config = {}) {
    return new Logger(config);
}

/**
 * Default logger instance for convenience
 */
export const defaultLogger = createLogger();