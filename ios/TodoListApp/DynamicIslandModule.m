#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DynamicIslandModule, NSObject)

RCT_EXTERN_METHOD(updateDynamicIsland:(NSDictionary *)payload)

+ (void)load {
    NSLog(@"DynamicIslandModule.m: Module loaded");
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end