with open('src/App.tsx', 'r') as f:
    content = f.read()

content = content.replace('{/* Persisted Views */}', """          {/* Loading Processing State */}
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <h3 className="text-xl font-semibold text-white">Processing Data...</h3>
              <p className="text-neutral-400 text-sm mt-2">Classifying files and organizing smart views</p>
            </div>
          )}

          {/* Persisted Views */}""")

with open('src/App.tsx', 'w') as f:
    f.write(content)

