import Foundation
import ActivityKit
import React

@objc(DynamicIslandModule)
class DynamicIslandModule: NSObject, RCTBridgeModule {
    static func moduleName() -> String {
        return "DynamicIslandModule"
    }
    
    var currentActivity: Activity<TodoListAttributes>? = nil
    
    override init() {
        super.init()
        NSLog("DynamicIslandModule.swift: Module initialized")
    }
    
    static func requiresMainQueueSetup() -> Bool {
        NSLog("DynamicIslandModule.swift: requiresMainQueueSetup called")
        return true
    }
    
    @objc(updateDynamicIsland:)
    func updateDynamicIsland(_ payload: NSDictionary) {
        NSLog("DynamicIslandModule.swift: updateDynamicIsland method called")
        NSLog("DynamicIslandModule.swift: payload type: %@", String(describing: type(of: payload)))
        
        DispatchQueue.main.async {
            NSLog("DynamicIslandModule.swift: Inside main queue")
            NSLog("DynamicIslandModule.swift: Full payload: %@", payload)
            
            guard let type = payload["type"] as? String,
                  let data = payload["data"] as? [String: Any],
                  let count = data["count"] as? Int else {
                NSLog("DynamicIslandModule.swift: Invalid payload format")
                NSLog("DynamicIslandModule.swift: type = %@", String(describing: payload["type"]))
                NSLog("DynamicIslandModule.swift: data = %@", String(describing: payload["data"]))
                return
            }
            
            NSLog("DynamicIslandModule.swift: Successfully parsed payload - count: \(count)")
            
            if #available(iOS 16.1, *) {
                NSLog("DynamicIslandModule.swift: iOS 16.1+ available, updating activity")
                self.updateOrStartActivity(count: count)
            } else {
                NSLog("DynamicIslandModule.swift: iOS version not supported")
            }
        }
    }
    
    @available(iOS 16.1, *)
    private func updateOrStartActivity(count: Int) {
        let attributes = TodoListAttributes()
        let contentState = TodoListAttributes.ContentState(taskCount: count)

        NSLog("DynamicIslandModule.swift: Updating or starting activity with count: \(count)")
        
        if let currentActivity = currentActivity {
            // Update existing activity
            Task {
                await currentActivity.update(using: contentState)
            }
        } else {
            // Start new activity
            do {
                let activity = try Activity.request(
                    attributes: attributes,
                    contentState: contentState
                )
                currentActivity = activity
                NSLog("DynamicIslandModule.swift: New activity started")
            } catch {
                NSLog("DynamicIslandModule.swift: Error starting live activity: \(error.localizedDescription)")
            }
        }
    }
}